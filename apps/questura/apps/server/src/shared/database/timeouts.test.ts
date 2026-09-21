import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  advisoryLockTimeouts,
  connectionOptions,
  poolTimeoutOptions,
  servingTimeouts,
} from './timeouts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('servingTimeouts', () => {
  it('has budgets even with nothing configured', () => {
    expect(servingTimeouts()).toEqual({
      statementMs: 15_000,
      lockMs: 5_000,
      idleInTransactionMs: 30_000,
    })
  })

  it('takes overrides from the environment', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '2000')
    expect(servingTimeouts().statementMs).toBe(2000)
  })

  it('ignores a value that is not a number', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', 'soon')
    expect(servingTimeouts().statementMs).toBe(15_000)
  })
})

describe('connectionOptions', () => {
  it('sends every budget that is switched on', () => {
    expect(connectionOptions({ statementMs: 1, lockMs: 2, idleInTransactionMs: 3 })).toBe(
      '-c statement_timeout=1 -c lock_timeout=2 -c idle_in_transaction_session_timeout=3',
    )
  })

  // 0 is how the migration scripts opt out: a schema change may take longer
  // than a page view, and a migration killed halfway is worse than a slow one.
  it('omits a budget set to zero', () => {
    expect(connectionOptions({ statementMs: 0, lockMs: 0, idleInTransactionMs: 0 })).toBe('')
    expect(poolTimeoutOptions({ statementMs: 0, lockMs: 0, idleInTransactionMs: 0 })).toEqual({})
  })
})

describe('advisoryLockTimeouts', () => {
  // lock_timeout does not cover advisory locks, so the wait is bounded by
  // statement_timeout or by nothing at all.
  it('bounds the wait with a statement budget and sets no lock budget', () => {
    const timeouts = advisoryLockTimeouts()
    expect(timeouts.statementMs).toBe(30_000)
    expect(timeouts.lockMs).toBe(0)
    expect(connectionOptions(timeouts)).toContain('statement_timeout=30000')
    expect(connectionOptions(timeouts)).not.toContain('lock_timeout')
  })
})
