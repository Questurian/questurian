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
}
