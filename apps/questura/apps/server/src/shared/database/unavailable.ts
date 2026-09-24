/**
 * Whether an error means "the database could not answer", as opposed to "the
 * query was wrong".
 *
 * The first is about right now and says nothing about the request, so the
 * honest answer is a 503 the caller can retry, not a 500 that reads as a bug.
 * It is what the client-side limits in `timeouts.ts` produce when the
 * database is frozen, and what `pg` produces when it is gone.
 *
 * Errors reach a route wrapped (drizzle's `DrizzleQueryError`, Payload's own
 * errors), so the chain of `cause`s is walked, not just the outer error.
 */

/** SQLSTATEs that describe the server's state, not the statement. */
const UNAVAILABLE_SQLSTATE = new Set([
  '57014', // query_canceled: our own statement budget, a database too busy to answer in time
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now: starting up, or in recovery
  '53300', // too_many_connections
])

const UNAVAILABLE_ERRNO = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH'])

/** What `pg` and `pg-pool` throw, which carry no code. */
const UNAVAILABLE_MESSAGE = [
  'Query read timeout', // query_timeout
  'timeout exceeded when trying to connect', // pg-pool connectionTimeoutMillis
  'Connection terminated', // due to connection timeout / unexpectedly
  'Client has encountered a connection error',
]

export function isDatabaseUnavailable(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current !== 'object') return false
    const { code, message, cause } = current as { code?: unknown; message?: unknown; cause?: unknown }

    if (typeof code === 'string') {
      // Class 08: connection exception.
      if (code.startsWith('08') && code.length === 5) return true
      if (UNAVAILABLE_SQLSTATE.has(code) || UNAVAILABLE_ERRNO.has(code)) return true
    }
    if (typeof message === 'string' && UNAVAILABLE_MESSAGE.some((fragment) => message.includes(fragment))) {
      return true
    }

    current = cause
  }
  return false
}
