/**
 * Statement, lock and idle budgets for every pool this process opens.
 *
 * `connectionTimeoutMillis` bounds *getting* a connection. Nothing bounded
 * what happened once you had one: a query with no plan, a lock nobody
 * releases, a transaction left open by a handler that returned early — each
 * holds a connection indefinitely while everything else queues behind it, and
 * aborting the HTTP request does not stop the database doing the work.
 *
 * These are server-side budgets, sent with the connection, so Postgres cancels
 * the statement itself rather than the client hoping it will stop.
 *
 * Every value is an env override, because the right number is a property of
 * the deployment and not of this file. `0` disables one, which is what the
 * migration scripts do: a schema change is allowed to take longer than a page
 * view, and a migration killed halfway is worse than a slow one.
 */

type Env = Record<string, string | undefined>

function readMs(env: Env, name: string, fallback: number): number {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return fallback

  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

/** The variables these budgets read, so a validator can report the unparseable ones. */
export const TIMEOUT_ENV = [
  'PG_STATEMENT_TIMEOUT_MS',
  'PG_LOCK_TIMEOUT_MS',
  'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS',
  'PG_ADVISORY_LOCK_WAIT_MS',
] as const

export type DatabaseTimeouts = {
  statementMs: number
  lockMs: number
  idleInTransactionMs: number
}

/**
 * Serving budgets: the pools behind page reads, admin writes and auth.
 *
 * 15s for a statement is far past any healthy query here — the slowest
 * measured public read spends about 50ms in SQL — and short enough that a
 * pathological one releases its connection while the site is still up.
 */
export function servingTimeouts(env: Env = process.env): DatabaseTimeouts {
  return {
    statementMs: readMs(env, 'PG_STATEMENT_TIMEOUT_MS', 15_000),
    lockMs: readMs(env, 'PG_LOCK_TIMEOUT_MS', 5_000),
    idleInTransactionMs: readMs(env, 'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', 30_000),
  }
}

/**
 * How long a webhook may wait for an advisory lock.
 *
 * `lock_timeout` does not apply to advisory locks — it covers table and row
 * locks. `SELECT pg_advisory_lock(...)` is bounded by `statement_timeout` or
 * by nothing, and "by nothing" is a webhook holding a connection until the
 * process dies. The lock pool runs nothing but lock and unlock, so a statement
 * budget here bounds waiting and only waiting.
 */
export function advisoryLockTimeouts(env: Env = process.env): DatabaseTimeouts {
  return {
    statementMs: readMs(env, 'PG_ADVISORY_LOCK_WAIT_MS', 30_000),
    lockMs: 0,
    idleInTransactionMs: readMs(env, 'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', 30_000),
  }
}

/**
 * The budgets as a libpq `options` string, for `new Pool({ options })`.
 *
 * Set on the connection rather than issued as a first query, so a connection
 * cannot serve anything before its budget applies — including a connection
 * the pool opens to replace one that just died under load, which is exactly
 * when the budget matters.
 */
export function connectionOptions(timeouts: DatabaseTimeouts): string {
  const settings: string[] = []

  if (timeouts.statementMs > 0) settings.push(`-c statement_timeout=${timeouts.statementMs}`)
  if (timeouts.lockMs > 0) settings.push(`-c lock_timeout=${timeouts.lockMs}`)
  if (timeouts.idleInTransactionMs > 0) {
    settings.push(`-c idle_in_transaction_session_timeout=${timeouts.idleInTransactionMs}`)
  }

  return settings.join(' ')
}

/** `new Pool({ ...poolTimeoutOptions(servingTimeouts()) })`, or nothing if all are off. */
export function poolTimeoutOptions(timeouts: DatabaseTimeouts): { options?: string } {
  const options = connectionOptions(timeouts)
  return options ? { options } : {}
}
