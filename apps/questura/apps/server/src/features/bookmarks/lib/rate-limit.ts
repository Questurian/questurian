import { getClientIp, hashIdentifier, incrementCounter } from '@/shared/lib/rate-limit-counter'

/**
 * Throttle for bookmark writes.
 *
 * There is no cap on how many bookmarks a visitor may hold — a reader with
 * eight hundred saved articles is a good outcome, not an attack. What is
 * bounded is the write *rate*, so a script cannot turn a one-row-per-click
 * table into unbounded growth.
 *
 * Keyed by account rather than IP: the route has already resolved the session
 * by the time it gets here, and an account key survives a rotating IP while
 * leaving a shared network's readers alone.
 */

const WINDOW_SECONDS = 60
const MAX_WRITES_PER_ACCOUNT = 60

export type BookmarkRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export async function checkBookmarkWriteRateLimit(
  authUserId: string,
  headers: Headers
): Promise<BookmarkRateLimitResult> {
  const key = `bookmarks:rate-limit:write:user:${hashIdentifier(authUserId)}`

  let counter
  try {
    counter = await incrementCounter(key, WINDOW_SECONDS)
  } catch (error) {
    // Fail closed, like every other limiter here: a counter outage must be
    // distinguishable from real traffic, and the alternative is an unbounded
    // write endpoint. `getClientIp` is read only for the log line, so an
    // outage is traceable to a caller.
    console.error(
      `[bookmarks] write rate limit unavailable; denying (ip=${hashIdentifier(getClientIp(headers))})`,
      error
    )
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
  }

  if (counter.count > MAX_WRITES_PER_ACCOUNT) {
    return { allowed: false, retryAfterSeconds: counter.ttlSeconds }
  }

  return { allowed: true }
}
