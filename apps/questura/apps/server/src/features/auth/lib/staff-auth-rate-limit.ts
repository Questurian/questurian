import {
  getClientIp,
  hashIdentifier,
  incrementCounter,
  type CounterResult,
} from '@/shared/lib/rate-limit-counter'

/**
 * Rate limits for the staff (Payload `users`) credential endpoints.
 *
 * `Users.ts` sets `lockTime: 0, maxLoginAttempts: 0`, Payload 3 ships no
 * built-in request throttling, and `middleware.ts` only logs in development, so
 * `POST /api/users/login` was an unthrottled password oracle against admin
 * accounts while visitors already had 10 sign-ins/min, 5 resets/min and
 * Turnstile. `/api/users/forgot-password` is public, unthrottled, and doubles
 * as the ABW invite primitive, making it an email-bombing and staff-enumeration
 * endpoint too.
 *
 * This throttles *requests* rather than enabling Payload's `maxLoginAttempts`,
 * which locks the account itself. Location Manager authenticates to
 * `/api/users/login` with a long-lived service identity; an account lock would
 * take LM down until `lockTime` elapsed, repeatedly, if its password were ever
 * misconfigured. LM caches its token and re-authenticates only near expiry
 * (`PayloadAuthClient.ensureAuthenticated`), so its real cadence sits far below
 * these ceilings and it needs no exemption.
 */

const WINDOW_SECONDS = 60

export const STAFF_LOGIN_LIMITS = {
  perIp: 10,
  perEmail: 5,
}

export const STAFF_FORGOT_PASSWORD_LIMITS = {
  perIp: 5,
  perEmail: 3,
}

export type StaffRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

type Limits = { perIp: number; perEmail: number }

export async function checkStaffAuthRateLimit({
  scope,
  headers,
  email,
  limits,
}: {
  scope: 'login' | 'forgot-password'
  headers: Headers
  email: string | null
  limits: Limits
}): Promise<StaffRateLimitResult> {
  const ipKey = `staff-auth:rate-limit:${scope}:ip:${hashIdentifier(getClientIp(headers))}`

  const counters = [incrementCounter(ipKey, WINDOW_SECONDS)]

  // Email is absent on malformed requests; those still count against the IP.
  if (email) {
    const emailKey = `staff-auth:rate-limit:${scope}:email:${hashIdentifier(email)}`
    counters.push(incrementCounter(emailKey, WINDOW_SECONDS))
  }

  let ipCounter: CounterResult
  let emailCounter: CounterResult | undefined

  try {
    ;[ipCounter, emailCounter] = await Promise.all(counters)
  } catch (error) {
    // No usable counter means no way to tell an attacker from an operator, and
    // these are the credential endpoints. Deny rather than wave everything
    // through; a Redis outage already failed these requests, just as a 500.
    //
    // But a 500 was also the *signal*. The caller turns this into an ordinary
    // "Too many attempts" message, which is exactly what an operator — or the
    // Location Manager service identity — would see during a counter outage,
    // so the reason has to be logged or it disappears entirely.
    console.error(`[staff-auth] ${scope} rate limit unavailable; denying`, error)
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
  }

  const retryAfterSeconds = Math.max(
    ipCounter.count > limits.perIp ? ipCounter.ttlSeconds : 0,
    emailCounter && emailCounter.count > limits.perEmail ? emailCounter.ttlSeconds : 0
  )

  if (retryAfterSeconds > 0) {
    return { allowed: false, retryAfterSeconds }
  }

  return { allowed: true }
}

export function normalizeStaffEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}
