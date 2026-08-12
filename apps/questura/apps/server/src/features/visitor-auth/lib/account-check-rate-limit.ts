import type { NextRequest } from 'next/server'

import {
  getClientIp,
  hashIdentifier,
  incrementCounter,
  type CounterResult,
} from '@/shared/lib/rate-limit-counter'

const WINDOW_SECONDS = 60
const MAX_REQUESTS_PER_IP = 10
const MAX_REQUESTS_PER_EMAIL = 5

export type AccountCheckRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export async function checkAccountCheckRateLimit(
  req: NextRequest,
  normalizedEmail: string
): Promise<AccountCheckRateLimitResult> {
  const ipKey = `visitor-auth:rate-limit:account-check:ip:${hashIdentifier(getClientIp(req.headers))}`
  const emailKey = `visitor-auth:rate-limit:account-check:email:${hashIdentifier(normalizedEmail)}`

  let ipCounter: CounterResult
  let emailCounter: CounterResult

  try {
    ;[ipCounter, emailCounter] = await Promise.all([
      incrementCounter(ipKey, WINDOW_SECONDS),
      incrementCounter(emailKey, WINDOW_SECONDS),
    ] as const)
  } catch (error) {
    // This route answers "does an account exist for this email?". With no
    // counter there is nothing bounding enumeration, so deny.
    //
    // Logged because the caller renders this as an ordinary "too many checks"
    // message: without a log line, a counter outage is indistinguishable from
    // real traffic and produces no monitoring signal at all.
    console.error('[visitor-auth] account-check rate limit unavailable; denying', error)
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
  }

  const retryAfterSeconds = Math.max(
    ipCounter.count > MAX_REQUESTS_PER_IP ? ipCounter.ttlSeconds : 0,
    emailCounter.count > MAX_REQUESTS_PER_EMAIL ? emailCounter.ttlSeconds : 0
  )

  if (retryAfterSeconds > 0) {
    return { allowed: false, retryAfterSeconds }
  }

  return { allowed: true }
}
