import { describe, expect, it } from 'vitest'

import { describePoolBudget, poolBudget, poolSizes } from './pool-budget'

const DIRECT = 'postgres://u:p@db.internal:5432/questura'
const POOLED = 'postgres://u:p@ep-cool-name-pooler.us-east-2.aws.neon.tech/questura'

/** A production environment that states every number, direct topology. */
const PRODUCTION = {
  NODE_ENV: 'production',
  DATABASE_URI: DIRECT,
  DATABASE_MAX_CONNECTIONS: '100',
  APP_PROCESS_COUNT: '1',
  APP_ROLLOUT_SURGE: '0',
}

describe('poolSizes', () => {
  it('defaults to the sizes the pools were always built with', () => {
    expect(poolSizes({})).toEqual({ payload: 20, visitorAuth: 10, advisoryLock: 10, startup: 1 })
  })

  it('takes a valid override, so a serverless instance can run smaller pools', () => {
    expect(poolSizes({ DATABASE_POOL_PAYLOAD_MAX: '5' }).payload).toBe(5)
  })

  // A pool built from NaN is a pool with no ceiling at all.
  it('never builds a pool from an invalid override', () => {
    expect(poolSizes({ DATABASE_POOL_PAYLOAD_MAX: 'lots' }).payload).toBe(20)
    expect(poolSizes({ DATABASE_POOL_PAYLOAD_MAX: '0' }).payload).toBe(20)
  })
})

describe('poolBudget outside production', () => {
  it('claims nothing when no allowance was declared', () => {
    const budget = poolBudget({ DATABASE_URI: DIRECT, APP_PROCESS_COUNT: '10' }, { production: false })
    expect(budget.problems).toEqual([])
    expect(budget.exceedsAllowance).toBe(false)
    expect(describePoolBudget(budget)).toContain('allowance not declared')
  })

  it('still reports an invalid value', () => {
    const budget = poolBudget({ APP_PROCESS_COUNT: 'three' }, { production: false })
    expect(budget.problems).toEqual([expect.stringContaining('APP_PROCESS_COUNT must be a whole number')])
  })
})

describe('poolBudget in production', () => {
  it('fits one process plus the nightly job and the reserve in 100', () => {
    const budget = poolBudget(PRODUCTION)
    // (1 serving + 0 surge + 1 job) × 41 + 5 reserve
    expect(budget.lines[0]).toMatchObject({ demand: 87, allowed: 100, fits: true })
    expect(budget.problems).toEqual([])
    expect(budget.exceedsAllowance).toBe(false)
  })

  // The regression this ticket exists for: an allowance of 0 (unset) used to
  // disable the check, and the process count silently defaulted to one.
  it('requires the allowance, the process ceiling and the rollout surge', () => {
    const budget = poolBudget({ NODE_ENV: 'production', DATABASE_URI: DIRECT })
    expect(budget.problems).toEqual([
      'DATABASE_MAX_CONNECTIONS is not set.',
      'APP_PROCESS_COUNT is not set.',
      'APP_ROLLOUT_SURGE is not set.',
    ])
  })

  it.each([
    ['DATABASE_MAX_CONNECTIONS', '0'],
    ['DATABASE_MAX_CONNECTIONS', 'Infinity'],
    ['APP_PROCESS_COUNT', '0'],
    ['APP_PROCESS_COUNT', '2.5'],
    ['APP_PROCESS_COUNT', '-1'],
    ['APP_ROLLOUT_SURGE', 'NaN'],
    ['DATABASE_POOL_PAYLOAD_MAX', '0'],
    ['DATABASE_RESERVED_CONNECTIONS', 'some'],
  ])('refuses %s=%s', (name, value) => {
    const budget = poolBudget({ ...PRODUCTION, [name]: value })
    expect(budget.problems).toEqual([expect.stringContaining(name)])
  })

  it('accepts a rollout surge of zero when the deploy stops old before starting new', () => {
    expect(poolBudget(PRODUCTION).rolloutSurge).toBe(0)
  })

  it('fits exactly at the allowance and not one connection past it', () => {
    // (4 + 0 + 1) × 41 = 205, + 5 reserve = 210
    const at = poolBudget({ ...PRODUCTION, APP_PROCESS_COUNT: '4', DATABASE_MAX_CONNECTIONS: '210' })
    const over = poolBudget({ ...PRODUCTION, APP_PROCESS_COUNT: '4', DATABASE_MAX_CONNECTIONS: '209' })
    expect(at.exceedsAllowance).toBe(false)
    expect(over.exceedsAllowance).toBe(true)
  })

  it('multiplies by every instance autoscaling may start', () => {
    const budget = poolBudget({ ...PRODUCTION, APP_PROCESS_COUNT: '3', APP_JOB_PROCESS_COUNT: '0', DATABASE_RESERVED_CONNECTIONS: '0' })
    expect(budget.lines[0]!.demand).toBe(123)
    expect(budget.exceedsAllowance).toBe(true)
  })

  it('counts both generations during a rolling deploy', () => {
    const steady = poolBudget({ ...PRODUCTION, APP_PROCESS_COUNT: '1', APP_ROLLOUT_SURGE: '0' })
    const rolling = poolBudget({ ...PRODUCTION, APP_PROCESS_COUNT: '1', APP_ROLLOUT_SURGE: '1' })
    expect(rolling.lines[0]!.demand - steady.lines[0]!.demand).toBe(41)
    expect(rolling.exceedsAllowance).toBe(true) // 128 > 100
  })

  it('lets smaller per-instance pools fit a larger fleet', () => {
    const budget = poolBudget({
      ...PRODUCTION,
      APP_PROCESS_COUNT: '10',
      APP_ROLLOUT_SURGE: '2',
      DATABASE_MAX_CONNECTIONS: '200',
      DATABASE_POOL_PAYLOAD_MAX: '5',
      DATABASE_POOL_VISITOR_AUTH_MAX: '3',
      DATABASE_POOL_ADVISORY_LOCK_MAX: '2',
    })
    // (10 + 2 + 1) × (5 + 3 + 2 + 1) + 5 = 148
    expect(budget.lines[0]).toMatchObject({ demand: 148, fits: true })
  })

  describe('behind a transaction pooler', () => {
    const pooled = {
      ...PRODUCTION,
      DATABASE_URI: POOLED,
      APP_PROCESS_COUNT: '20',
      APP_ROLLOUT_SURGE: '5',
      DATABASE_MAX_CONNECTIONS: '100',
      DATABASE_POOLER_MAX_CLIENTS: '10000',
      DATABASE_POOLER_POOL_SIZE: '40',
      DATABASE_POOL_ADVISORY_LOCK_MAX: '2',
    }

    // 26 processes × 41 = 1,066 "connections" would never fit 100 backends,
    // but pooled clients are not backends.
    it('does not count pooled clients as backends', () => {
      const budget = poolBudget(pooled)
      expect(budget.topology).toBe('pooled')
      expect(budget.lines).toEqual([
        expect.objectContaining({ demand: 26 * 31, allowed: 10_000, fits: true }),
        // 40 pooler backends + 26 × 2 direct lock connections + 5 reserve
        expect.objectContaining({ demand: 97, allowed: 100, fits: true }),
      ])
      expect(budget.exceedsAllowance).toBe(false)
    })

    it('still counts the direct advisory-lock pools against real backends', () => {
      const budget = poolBudget({ ...pooled, DATABASE_POOL_ADVISORY_LOCK_MAX: '10' })
      expect(budget.lines[1]).toMatchObject({ demand: 40 + 260 + 5, fits: false })
    })

    it('requires the pooler limits it depends on', () => {
      const { DATABASE_POOLER_MAX_CLIENTS: _a, DATABASE_POOLER_POOL_SIZE: _b, ...rest } = pooled
      expect(poolBudget(rest).problems).toEqual([
        'DATABASE_POOLER_MAX_CLIENTS is not set.',
        'DATABASE_POOLER_POOL_SIZE is not set.',
      ])
    })
  })
})

describe('describePoolBudget', () => {
  it('names the pools and processes so the number can be argued with', () => {
    const description = describePoolBudget(poolBudget({ ...PRODUCTION, APP_PROCESS_COUNT: '3' }))
    expect(description).toContain('3 serving + 0 rollout surge + 1 jobs')
    expect(description).toContain('20 payload')
    expect(description).toContain('10 advisory locks')
    expect(description).toContain('169 against 100 allowed')
  })
})
