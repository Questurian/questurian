import { getClientIp, UNIDENTIFIED_CLIENT } from '@/shared/lib/rate-limit-counter'

/**
 * How Better Auth's own rate limiter learns who is calling.
 *
 * Better Auth reads the client address from `advanced.ipAddress.ipAddressHeaders`.
 * When none of those headers holds a valid address, it returns `null` and —
 * in production only — **skips rate limiting for that request entirely**
 * (`better-auth/dist/api/rate-limiter`, "Rate limiting skipped: could not
 * determine client IP address"). In development and tests it substitutes
 * `127.0.0.1` instead, so no unit test ever saw the gap.
 *
 * Pointing it at the proxy header was not enough. A caller who reaches the
 * origin without passing the proxy sends no `CF-Connecting-IP` (or sends
 * junk), and sign-in, sign-up and password reset were then unlimited — while
 * every limiter of our own, reading `getClientIp`, put that caller in the
 * shared `unknown` bucket.
 *
 * So the route hands Better Auth our answer instead: one header this app owns,
 * always overwritten, always a valid address. Both limiters now see the same
 * caller the same way — IPv6 per /64 included — and Better Auth's `null`
 * branch cannot be reached through the handler.
 */
export const VISITOR_AUTH_CLIENT_IP_HEADER = 'x-questura-client-ip'

/**
 * Stands for "no address could be read". A valid address, so Better Auth
 * counts it rather than skipping, and reserved (RFC 1122 "this host"), so no
 * real caller shares it. Every unidentifiable caller shares its one bucket,
 * as they already do in our own limiters.
 */
export const UNIDENTIFIED_CLIENT_ADDRESS = '0.0.0.0'

/** The request, with this app's reading of the caller written over any claim. */
export function withClientIdentity(request: Request): Request {
  const address = getClientIp(request.headers)
  const headers = new Headers(request.headers)

  headers.set(
    VISITOR_AUTH_CLIENT_IP_HEADER,
    address === UNIDENTIFIED_CLIENT ? UNIDENTIFIED_CLIENT_ADDRESS : address
  )

  return new Request(request, { headers })
}
