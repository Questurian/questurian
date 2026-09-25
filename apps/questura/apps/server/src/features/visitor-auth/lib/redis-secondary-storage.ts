import Redis from 'ioredis'

import { APP_CONFIG } from '@/shared/config'
import { countOnRequest } from '@/shared/observability/request-report'

let redis: Redis | null = null

function readMs(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * Deadlines for every Redis call. Sessions and every rate limit go through
 * this client, and ioredis waits on a command for as long as the connection
 * lives by default: a slow or half-open Redis held each request open with it,
 * which under campaign traffic is every identity check at once. A command
 * that misses its deadline rejects, and each caller's own policy decides
 * what that means (public read limits fail open, payments fail closed).
 * Reconnects back off with jitter so a fleet does not retry in step.
 */
export function redisClientOptions() {
  return {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    connectTimeout: readMs('REDIS_CONNECT_TIMEOUT_MS', 3_000),
    commandTimeout: readMs('REDIS_COMMAND_TIMEOUT_MS', 1_000),
    retryStrategy: (times: number) => Math.min(times * 200, 2_000) + Math.floor(Math.random() * 100),
  }
}

function getRedis(): Redis {
  // One call here is one round trip (or one script); counted per request so
  // `/api/me`'s Server-Timing can say what a session lookup cost.
  countOnRequest('redis')
  if (!APP_CONFIG.redis.url) {
    throw new Error('REDIS_URL is required for production Visitor auth rate limiting')
  }

  if (!redis) {
    redis = new Redis(APP_CONFIG.redis.url, redisClientOptions())
  }

  return redis
}

/** The same client, for the session revocation list (`session-revocations.ts`). */
export const visitorAuthRedis = getRedis

export const redisSecondaryStorage = {
  async get(key: string): Promise<string | null> {
    return getRedis().get(key)
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl && ttl > 0) {
      await getRedis().set(key, value, 'EX', ttl)
      return
    }

    await getRedis().set(key, value)
  },

  async delete(key: string): Promise<void> {
    await getRedis().del(key)
  },

  // One atomic command (Redis 6.2+; soft-prod runs 7.x). A GET then DEL let
  // two concurrent callers both read a one-time value before either deleted it.
  async getAndDelete(key: string): Promise<string | null> {
    return getRedis().getdel(key)
  },

  async incrementWithExpiry(
    key: string,
    ttlSeconds: number
  ): Promise<{ count: number; ttlSeconds: number }> {
    const result = await getRedis().eval(
      `
        local count = redis.call('INCR', KEYS[1])
        local ttl = redis.call('TTL', KEYS[1])
        if count == 1 or ttl < 0 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
          ttl = tonumber(ARGV[1])
        end
        return { count, ttl }
      `,
      1,
      key,
      ttlSeconds
    )

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Redis returned an invalid rate-limit result')
    }

    return {
      count: Number(result[0]),
      ttlSeconds: Number(result[1]),
    }
  },

  /**
   * `incrementWithExpiry` for several keys in one round trip, answered in
   * key order. Used where one request checks more than one bucket (session
   * and address), so the check is one script rather than one per bucket.
   */
  async incrementManyWithExpiry(
    keys: string[],
    ttlSeconds: number
  ): Promise<Array<{ count: number; ttlSeconds: number }>> {
    const result = await getRedis().eval(
      `
        local out = {}
        for i, key in ipairs(KEYS) do
          local count = redis.call('INCR', key)
          local ttl = redis.call('TTL', key)
          if count == 1 or ttl < 0 then
            redis.call('EXPIRE', key, ARGV[1])
            ttl = tonumber(ARGV[1])
          end
          out[#out + 1] = count
          out[#out + 1] = ttl
        end
        return out
      `,
      keys.length,
      ...keys,
      ttlSeconds
    )

    if (!Array.isArray(result) || result.length !== keys.length * 2) {
      throw new Error('Redis returned an invalid rate-limit result')
    }

    return keys.map((_, i) => ({
      count: Number(result[i * 2]),
      ttlSeconds: Number(result[i * 2 + 1]),
    }))
  },
}
