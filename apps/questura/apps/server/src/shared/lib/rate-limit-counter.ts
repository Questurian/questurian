import { createHash } from 'node:crypto'

import { APP_CONFIG } from '@/shared/config'
import { redisSecondaryStorage } from '@/features/visitor-auth/lib/redis-secondary-storage'

/**
 * The fixed-window counter shared by every rate limiter in the app.
 *
 * Redis-backed when `REDIS_URL` is configured, with an in-memory fallback
 * otherwise. The fallback is per-process: with several instances and no Redis
 * the effective limit multiplies by instance count, so production is expected
 * to configure Redis (Better Auth already refuses to boot in production
 * without it).
 */

export type CounterResult = { count: number; ttlSeconds: number }

type LocalCounter = {
  count: number
  expiresAt: number
}

const localCounters = new Map<string, LocalCounter>()
let nextLocalCleanupAt = 0

export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function incrementLocalCounter(key: string, windowSeconds: number): CounterResult {
  const now = Date.now()

  if (now >= nextLocalCleanupAt) {
    for (const [counterKey, counter] of localCounters) {
      if (counter.expiresAt <= now) {
        localCounters.delete(counterKey)
      }
    }
    nextLocalCleanupAt = now + windowSeconds * 1000
  }

  const existing = localCounters.get(key)

  if (!existing || existing.expiresAt <= now) {
    localCounters.set(key, {
      count: 1,
      expiresAt: now + windowSeconds * 1000,
    })
    return { count: 1, ttlSeconds: windowSeconds }
  }

  existing.count += 1
  return {
    count: existing.count,
    ttlSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  }
}

export async function incrementCounter(
  key: string,
  windowSeconds: number
): Promise<CounterResult> {
  if (APP_CONFIG.redis.url) {
    return redisSecondaryStorage.incrementWithExpiry(key, windowSeconds)
  }

  return incrementLocalCounter(key, windowSeconds)
}

/** Test seam: drop in-process counters between cases. */
export function resetLocalCounters(): void {
  localCounters.clear()
  nextLocalCleanupAt = 0
}

/**
 * A caller's IP, taken from the proxy headers Better Auth is also configured to
 * trust. Falls back to a constant so an unidentifiable caller still shares a
 * bucket rather than escaping the limit entirely.
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || headers.get('x-real-ip')?.trim() || 'unknown'
}
