import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  advisoryLockTimeouts,
  connectionOptions,
  poolTimeoutOptions,
  QUERY_TIMEOUT_MARGIN_MS,
  servingTimeouts,
} from './timeouts'

afterEach(() => {
  vi.unstubAllEnvs()
})

const OFF = { statementMs: 0, lockMs: 0, idleInTransactionMs: 0, queryMs: 0, connectMs: 0 }

describe('servingTimeouts', () => {
  it('has budgets even with nothing configured', () => {
    expect(servingTimeouts()).toEqual({
      statementMs: 15_000,
      lockMs: 5_000,
      idleInTransactionMs: 30_000,
      queryMs: 17_000,
      connectMs: 10_000,
    })
  })

  it('takes overrides from the environment', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '2000')
    vi.stubEnv('PG_CONNECTION_TIMEOUT_MS', '3000')
    expect(servingTimeouts()).toMatchObject({ statementMs: 2000, connectMs: 3000 })
  })

  it('ignores a value that is not a number', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', 'soon')
    expect(servingTimeouts().statementMs).toBe(15_000)
  })

  // With the server alive, Postgres must cancel first: a clean 57014, and the
  // server stops working. The client limit is for when it cannot.
  it('puts the client query limit above the statement budget it was given', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '4000')
    expect(servingTimeouts().queryMs).toBe(4000 + QUERY_TIMEOUT_MARGIN_MS)
  })

  it('takes an explicit client query limit', () => {
    vi.stubEnv('PG_QUERY_TIMEOUT_MS', '25000')
    expect(servingTimeouts().queryMs).toBe(25_000)
  })

  // The migration scripts turn the statement budget off. A client limit left
  // on would cut short the statement the server was told to let run.
  it('switches the client query limit off with the statement budget', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '0')
    expect(servingTimeouts().queryMs).toBe(0)
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
    expect(connectionOptions(OFF)).toBe('')
    expect(poolTimeoutOptions(OFF)).toEqual({})
  })
})

describe('poolTimeoutOptions', () => {
  it("hands pg its own client-side settings next to the server-side ones", () => {
    expect(poolTimeoutOptions(servingTimeouts())).toEqual({
      options: '-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000',
      query_timeout: 17_000,
      connectionTimeoutMillis: 10_000,
    })
  })

  // What the migration scripts' environment produces: nothing that could
  // stop a long schema change, and still a bound on getting a connection.
  it('leaves out every limit that is off', () => {
    vi.stubEnv('PG_STATEMENT_TIMEOUT_MS', '0')
    vi.stubEnv('PG_LOCK_TIMEOUT_MS', '0')
    vi.stubEnv('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', '0')
    vi.stubEnv('PG_QUERY_TIMEOUT_MS', '0')
    expect(poolTimeoutOptions(servingTimeouts())).toEqual({ connectionTimeoutMillis: 10_000 })
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

  // The serving query limit is sized for page reads; a lock wait is allowed
  // to be longer, so it gets its own limit above its own budget.
  it('keeps its client limit above the lock wait, not the serving limit', () => {
    vi.stubEnv('PG_QUERY_TIMEOUT_MS', '5000')
    expect(advisoryLockTimeouts().queryMs).toBe(30_000 + QUERY_TIMEOUT_MARGIN_MS)
  })
})
