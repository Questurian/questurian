import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'

import { APP_CONFIG } from '@/shared/config'
import { redisSecondaryStorage } from './redis-secondary-storage'

const WINDOW_SECONDS = 60
const MAX_REQUESTS_PER_IP = 10
const MAX_REQUESTS_PER_EMAIL = 5

type RateLimitCounter = {
  count: number
  expiresAt: number
}

export type AccountCheckRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

const localCounters = new Map<string, RateLimitCounter>()
let nextLocalCleanupAt = 0

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || req.headers.get('x-real-ip')?.trim() || 'unknown'
}

function incrementLocalCounter(key: string): { count: number; ttlSeconds: number } {
  const now = Date.now()

  if (now >= nextLocalCleanupAt) {
    for (const [counterKey, counter] of localCounters) {
      if (counter.expiresAt <= now) {
        localCounters.delete(counterKey)
      }
    }
    nextLocalCleanupAt = now + WINDOW_SECONDS * 1000
  }

  const existing = localCounters.get(key)

  if (!existing || existing.expiresAt <= now) {
    localCounters.set(key, {
      count: 1,
      expiresAt: now + WINDOW_SECONDS * 1000,
    })
    return { count: 1, ttlSeconds: WINDOW_SECONDS }
  }

  existing.count += 1
  return {
    count: existing.count,
    ttlSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  }
}

async function incrementCounter(key: string) {
  if (APP_CONFIG.redis.url) {
    return redisSecondaryStorage.incrementWithExpiry(key, WINDOW_SECONDS)
  }

  return incrementLocalCounter(key)
}

export async function checkAccountCheckRateLimit(
  req: NextRequest,
  normalizedEmail: string
): Promise<AccountCheckRateLimitResult> {
  const ipKey = `visitor-auth:rate-limit:account-check:ip:${hashIdentifier(getClientIp(req))}`
  const emailKey = `visitor-auth:rate-limit:account-check:email:${hashIdentifier(normalizedEmail)}`

  const [ipCounter, emailCounter] = await Promise.all([
    incrementCounter(ipKey),
    incrementCounter(emailKey),
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
