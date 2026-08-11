import type { NextRequest } from 'next/server'

import {
  getClientIp,
  hashIdentifier,
  incrementCounter,
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

  const [ipCounter, emailCounter] = await Promise.all([
    incrementCounter(ipKey, WINDOW_SECONDS),
    incrementCounter(emailKey, WINDOW_SECONDS),
  ])

  const retryAfterSeconds = Math.max(
    ipCounter.count > MAX_REQUESTS_PER_IP ? ipCounter.ttlSeconds : 0,
    emailCounter.count > MAX_REQUESTS_PER_EMAIL ? emailCounter.ttlSeconds : 0
  )

  if (retryAfterSeconds > 0) {
    return { allowed: false, retryAfterSeconds }
  }

  return { allowed: true }
}
