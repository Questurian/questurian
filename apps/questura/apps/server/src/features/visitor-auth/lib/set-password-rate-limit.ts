import {
  getClientIp,
  hashIdentifier,
  incrementCounter,
} from '@/shared/lib/rate-limit-counter'

/**
 * Throttle for `POST /api/account/set-password`.
 *
 * Better Auth's own `rateLimit` config runs in `router()`'s `onRequest`, so it
 * only covers requests that arrive through `visitorAuth.handler`. This route is
 * a server adapter that calls `visitorAuth.api.setPassword` directly (see
 * ADR-0004: the browser client does not expose `setPassword`), which skips the
 * router entirely — limiter included.
 *
 * Keyed by IP alone. Keying by account would mean resolving the session first,
 * which is the database work the throttle exists to bound.
 */

const WINDOW_SECONDS = 60
const MAX_REQUESTS_PER_IP = 5

export type SetPasswordRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export async function checkSetPasswordRateLimit(
  headers: Headers
): Promise<SetPasswordRateLimitResult> {
  const ipKey = `visitor-auth:rate-limit:set-password:ip:${hashIdentifier(getClientIp(headers))}`

  let counter
  try {
    counter = await incrementCounter(ipKey, WINDOW_SECONDS)
  } catch {
    // No usable counter backend: deny rather than leave a credential-setting
    // route unbounded.
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
  }

  if (counter.count > MAX_REQUESTS_PER_IP) {
    return { allowed: false, retryAfterSeconds: counter.ttlSeconds }
  }

  return { allowed: true }
}
