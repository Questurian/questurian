import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applicationName,
  declaredProcessCount,
  fleetManifestProblems,
  previousGenerationPerProcess,
  servingLimitProblems,
  topologyProblems,
  transientPeakConnections,
} from './fleet-manifest'

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * The arithmetic in `pool-budget.ts` is right. What it cannot do is notice
 * that the numbers it was handed describe a fleet nobody is going to deploy.
 */
describe('processes, not containers', () => {
  it('multiplies replicas by the processes each one runs', () => {
    const { processes, problems } = declaredProcessCount({
      APP_REPLICA_COUNT: '4',
      APP_PROCESSES_PER_REPLICA: '2',
    })

    // Four containers running two Node processes is eight sets of pools.
    // CAP-07's own example said "4 processes" while describing four
    // containers.
    expect(processes).toBe(8)
    expect(problems).toEqual([])
  })

  it('refuses a declaration that disagrees with itself', () => {
    const { problems } = declaredProcessCount({
      APP_PROCESS_COUNT: '4',
      APP_REPLICA_COUNT: '4',
      APP_PROCESSES_PER_REPLICA: '2',
    })

    expect(problems.join(' ')).toContain('APP_PROCESS_COUNT is 4')
    expect(problems.join(' ')).toContain('is 8')
  })

  it('refuses replicas with no processes-per-replica, rather than assuming one', () => {
    const { problems } = declaredProcessCount({ APP_REPLICA_COUNT: '4' })
    expect(problems.join(' ')).toContain('APP_PROCESSES_PER_REPLICA is not')
  })

  it('leaves an explicit process count alone', () => {
    expect(declaredProcessCount({ APP_PROCESS_COUNT: '4' })).toEqual({ processes: null, problems: [] })
  })
})

/**
 * A rollout is heterogeneous. Multiplying one per-process ceiling by every
 * process assumes the old generation uses the new release's pool sizes — and
 * the deploy that changes a pool size is exactly the deploy where both
 * generations are alive at once.
 */
describe('a rolling deploy runs two different releases', () => {
  it('assumes the previous generation matches when nothing says otherwise', () => {
    expect(previousGenerationPerProcess({}).perProcess).toBe(41)
  })

  it('sums the two generations separately when they differ', () => {
    const peak = transientPeakConnections(
      { APP_PREVIOUS_PER_PROCESS_CONNECTIONS: '61' },
      { servingProcesses: 4, rolloutSurge: 1, jobProcesses: 1, reserved: 5 },
    )

    // 4×41 (this release) + 1×61 (the one being replaced) + 1×41 + 5
    expect(peak).toBe(164 + 61 + 41 + 5)
  })

  it('matches the homogeneous formula when the generations are the same', () => {
    const peak = transientPeakConnections({}, { servingProcesses: 4, rolloutSurge: 1, jobProcesses: 1, reserved: 5 })
    expect(peak).toBe(6 * 41 + 5)
    // CAP-07's unapproved proposal, for comparison.
    expect(peak).toBe(251)
  })
})

/**
 * A heuristic reads hostnames. A pooler it does not recognise selects direct
 * advisory-lock semantics silently — and those locks are what keeps two
 * concurrent Stripe webhooks for one customer from both acting.
 */
describe('topology is declared, not guessed', () => {
  it('says nothing when nothing is declared', () => {
    expect(topologyProblems({ DATABASE_URI: 'postgres://u:p@db.internal:5432/q' })).toEqual([])
  })

  it('accepts a declaration the heuristic agrees with', () => {
    expect(
      topologyProblems({ DATABASE_TOPOLOGY: 'pooled', DATABASE_URI: 'postgres://u:p@x-pooler.neon.tech/q' }),
    ).toEqual([])
  })

  it('refuses a pooler the heuristic could not see', () => {
    const problems = topologyProblems({
      DATABASE_TOPOLOGY: 'pooled',
      DATABASE_URI: 'postgres://u:p@db.internal:5432/q',
    })

    expect(problems.join(' ')).toContain('One of them is wrong')
    expect(problems.join(' ')).toContain('advisory locks')
  })

  it('refuses a value that is neither', () => {
    expect(topologyProblems({ DATABASE_TOPOLOGY: 'maybe' }).join(' ')).toContain('must be "direct" or "pooled"')
  })
})

/**
 * A setting can be configured and meaningless. The overrides accept any
 * positive integer, so a gate limit of a hundred thousand is "valid" and is
 * the absence of a gate wearing a number.
 */
describe('serving limits that are configured and mean nothing', () => {
  it('passes a sane configuration', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '')
    expect(servingLimitProblems({ PUBLIC_QUERY_CONCURRENCY: '8' })).toEqual([])
  })

  it('refuses a gate limit that is not a limit', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '')
    expect(servingLimitProblems({ PUBLIC_QUERY_CONCURRENCY: '100000' }).join(' ')).toContain(
      'absence of one wearing a number',
    )
  })

  it('refuses a queue longer than anyone waits', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '')
    expect(servingLimitProblems({ PUBLIC_ASSEMBLY_QUEUE_MS: '120000' }).join(' ')).toContain('later than a reader waits')
  })

  it('reports an unparseable override instead of silently keeping the default', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '')
    expect(servingLimitProblems({ PUBLIC_INGRESS_CONCURRENCY: 'lots' }).join(' ')).toContain('must be a whole number')
  })

  // The migration scripts set this to 0 deliberately. A serving process that
  // inherits that environment has no bound on a runaway query, and nothing
  // about the process would look wrong.
  it('refuses the migration scripts statement timeout in a serving process', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '0')
    expect(servingLimitProblems({}).join(' ')).toContain("migration scripts' value")
  })

  it('refuses a disabled idle-in-transaction timeout', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '0')
    expect(servingLimitProblems({}).join(' ')).toContain('holds its connection and its locks')
  })
})

describe('application_name', () => {
  it('names the role, the release and the pool', () => {
    expect(applicationName('payload', { APP_ROLE: 'serving', QUESTURA_RELEASE_SHA: 'abcdef1234' })).toBe(
      'questura:serving:abcdef1:payload',
    )
  })

  it('is still usable with nothing configured', () => {
    expect(applicationName('advisoryLock', {})).toBe('questura:serving:dev:advisoryLock')
  })
})

describe('fleetManifestProblems', () => {
  it('collects every kind at once, rather than stopping at the first', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '0')
    const problems = fleetManifestProblems({
      APP_REPLICA_COUNT: '4',
      DATABASE_TOPOLOGY: 'nonsense',
    })

    expect(problems.length).toBeGreaterThanOrEqual(3)
  })
})
