import Redis from 'ioredis'

import { APP_CONFIG } from '@/shared/config'

let redis: Redis | null = null

function getRedis(): Redis {
  if (!APP_CONFIG.redis.url) {
    throw new Error('REDIS_URL is required for production Visitor auth rate limiting')
  }

  if (!redis) {
    redis = new Redis(APP_CONFIG.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    })
  }

  return redis
}

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

  async getAndDelete(key: string): Promise<string | null> {
    const client = getRedis()
    const value = await client.get(key)
    if (value !== null) {
      await client.del(key)
    }
    return value
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
}
