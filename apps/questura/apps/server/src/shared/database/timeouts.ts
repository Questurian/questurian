/**
 * Every time limit on this process's database connections, in one place.
 *
 * Two kinds, and each covers what the other cannot:
 *
 * **Server-side** (`statement_timeout`, `lock_timeout`,
 * `idle_in_transaction_session_timeout`), sent with the connection so Postgres
 * cancels the statement itself. A query with no plan, a lock nobody releases,
 * a transaction a handler left open: each would hold a connection
 * indefinitely, and aborting the HTTP request does not stop the database
 * doing the work.
 *
 * **Client-side** (`connectionTimeoutMillis`, `query_timeout`), enforced by
 * `pg` in this process. These are the only limits that fire when the server
 * cannot answer at all. A database that is *frozen* rather than down (paused
 * container, stalled network path, a compute that accepted the TCP connection
 * and went quiet) cancels nothing, because nothing on its side is running. The
 * pool's idle connections are already open, so `connectionTimeoutMillis` never
 * applies either. Before `query_timeout` every API request against a frozen
 * database waited forever (readiness:faults, "database down").
 *
 * How the numbers were chosen (measured 2026-09-24, readiness sandbox,
 * production build, `pg_stat_statements`):
 *
 * - The slowest legitimate statement found was an admin list view paged deep
 *   into articles sorted by title (`/api/articles?page=900&sort=title`,
 *   Payload's lateral joins over a 9,200-article synthetic corpus): 703 ms.
 *   That corpus is roughly 370 times the real site's 25 articles. Everything
 *   else readiness:routes and the heavy public and admin reads sent (sitemap
 *   batches, index, search, admin search) stayed under 10 ms at that size;
 *   the launch-corpus seed peaked at 82 ms. The nightly reconcile needs
 *   Stripe, so it was read rather than run: single-profile reads and writes
 *   and a prune that deletes in batches, nothing long.
 * - So a 15 s statement budget is about 20 times the worst case at many times
 *   the real size, and short enough that a pathological query releases its
 *   connection while the site is still up.
 * - `query_timeout` sits a margin *above* the statement budget, never below
 *   it. With the server alive, Postgres cancels first and the client sees a
 *   clean `57014` while the server stops working. The client limit fires only
 *   when the server could not, and the margin covers the round trip and an
 *   event loop busy with other requests.
 * - The frontend (apps/client `DEFAULT_TIMEOUT_MS`) gives up on the API at
 *   10 s, so for a reader the client limit is not about latency. It bounds
 *   how long this process holds a pool slot and a request for an answer that
 *   is never coming.
 *
 * Every value is an env override, because the right number is a property of
 * the deployment and not of this file. `0` disables one, which is what the
 * migration scripts do (`db:migrate*` in package.json): a schema change is
 * allowed to take longer than a page view, and a migration killed halfway is
 * worse than a slow one. Other long jobs (the nightly reconcile, seeds,
 * backfills) run through the serving budgets and fit well inside them; one
 * that ever needs longer should set these variables to 0 for its own command,
 * the way the migration scripts do, rather than raising them for everyone.
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
  'PG_QUERY_TIMEOUT_MS',
  'PG_CONNECTION_TIMEOUT_MS',
] as const

/**
 * How far above the statement budget the client-side limit sits, when
 * `PG_QUERY_TIMEOUT_MS` is not set. See the header for why it is above.
 */
export const QUERY_TIMEOUT_MARGIN_MS = 2_000

/** Getting a connection: opening one, or waiting for a free one in the pool. */
const CONNECTION_TIMEOUT_MS = 10_000

export type DatabaseTimeouts = {
  /** Server-side `statement_timeout`. */
  statementMs: number
  /** Server-side `lock_timeout`. */
  lockMs: number
  /** Server-side `idle_in_transaction_session_timeout`. */
  idleInTransactionMs: number
  /** Client-side `query_timeout`: the limit that fires when the server cannot. */
  queryMs: number
  /** Client-side `connectionTimeoutMillis`. */
  connectMs: number
}

/**
 * The client-side limits for a given statement budget. With the statement
 * budget off (the migration scripts), the client limit is off too: it must
 * never cut short a statement the server was told to let run.
 */
function clientLimits(env: Env, statementMs: number): Pick<DatabaseTimeouts, 'queryMs' | 'connectMs'> {
  const derived = statementMs > 0 ? statementMs + QUERY_TIMEOUT_MARGIN_MS : 0
  return {
    queryMs: readMs(env, 'PG_QUERY_TIMEOUT_MS', derived),
    connectMs: readMs(env, 'PG_CONNECTION_TIMEOUT_MS', CONNECTION_TIMEOUT_MS),
  }
}

/**
 * Serving budgets: the pools behind page reads, admin writes and auth.
 * 15 s statement, 17 s client; the header says how those were chosen.
 */
export function servingTimeouts(env: Env = process.env): DatabaseTimeouts {
  const statementMs = readMs(env, 'PG_STATEMENT_TIMEOUT_MS', 15_000)
  return {
    statementMs,
    lockMs: readMs(env, 'PG_LOCK_TIMEOUT_MS', 5_000),
    idleInTransactionMs: readMs(env, 'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', 30_000),
    ...clientLimits(env, statementMs),
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
  const statementMs = readMs(env, 'PG_ADVISORY_LOCK_WAIT_MS', 30_000)
  return {
    statementMs,
    lockMs: 0,
    idleInTransactionMs: readMs(env, 'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', 30_000),
    // Not `PG_QUERY_TIMEOUT_MS`: that one is sized against the serving budget,
    // and a lock wait is allowed to be longer. The margin keeps the same shape.
    queryMs: statementMs > 0 ? statementMs + QUERY_TIMEOUT_MARGIN_MS : 0,
    connectMs: readMs(env, 'PG_CONNECTION_TIMEOUT_MS', CONNECTION_TIMEOUT_MS),
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
export function connectionOptions(
  timeouts: Pick<DatabaseTimeouts, 'statementMs' | 'lockMs' | 'idleInTransactionMs'>,
): string {
  const settings: string[] = []

  if (timeouts.statementMs > 0) settings.push(`-c statement_timeout=${timeouts.statementMs}`)
  if (timeouts.lockMs > 0) settings.push(`-c lock_timeout=${timeouts.lockMs}`)
  if (timeouts.idleInTransactionMs > 0) {
    settings.push(`-c idle_in_transaction_session_timeout=${timeouts.idleInTransactionMs}`)
  }

  return settings.join(' ')
}

export type PoolTimeoutOptions = {
  options?: string
  query_timeout?: number
  connectionTimeoutMillis?: number
}

/**
 * Everything a `new Pool({ ...poolTimeoutOptions(servingTimeouts()) })` needs:
 * the server-side budgets as `options`, and the client-side limits as `pg`'s
 * own settings. A limit set to 0 is left out, which `pg` reads as no limit.
 */
export function poolTimeoutOptions(timeouts: DatabaseTimeouts): PoolTimeoutOptions {
  const result: PoolTimeoutOptions = {}
  const options = connectionOptions(timeouts)
  if (options) result.options = options
  if (timeouts.queryMs > 0) result.query_timeout = timeouts.queryMs
  if (timeouts.connectMs > 0) result.connectionTimeoutMillis = timeouts.connectMs
  return result
}
