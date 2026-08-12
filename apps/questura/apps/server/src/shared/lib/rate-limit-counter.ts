import { createHash } from 'node:crypto'

import { APP_CONFIG } from '@/shared/config'
import { redisSecondaryStorage } from '@/features/visitor-auth/lib/redis-secondary-storage'

/**
 * The fixed-window counter shared by every rate limiter in the app.
 *
 * Redis-backed when `REDIS_URL` is configured. Without it the counter falls back
 * to per-process memory, which is only ever correct for a single process: with
 * several instances the effective limit multiplies by instance count, so ten
 * Staff logins a minute becomes ten *per instance*. That fallback is therefore
 * barred from production — `incrementCounter` throws rather than silently
 * granting a larger budget, and `assertProductionConfig` catches the missing
 * variable at boot so the throw is a backstop rather than the first symptom.
 *
 * Better Auth's own limiter refuses to boot in production without `REDIS_URL`,
 * but that check lives in the Better Auth module: a process that never imports
 * it (a worker, a script, a route that only touches the Payload half) used to
 * reach these counters with memory counting silently in place.
 */

export type CounterResult = { count: number; ttlSeconds: number }

/**
 * Thrown when no shared counter backend is available and memory counting would
 * be unsafe. Callers must treat this as a denial, never as an allowance.
 */
export class RateLimitBackendUnavailableError extends Error {
  constructor() {
    super(
      'REDIS_URL is not configured. Refusing to rate limit from per-process memory ' +
        'in production, where the effective limit would multiply by instance count.'
    )
    this.name = 'RateLimitBackendUnavailableError'
  }
}

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

  if (APP_CONFIG.isProduction) {
    throw new RateLimitBackendUnavailableError()
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
