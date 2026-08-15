import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The shared counter is the only thing standing between the Staff credential
 * endpoints and an unthrottled password oracle, so the property under test is
 * not "it counts" but "it counts the same for every instance, or it refuses".
 *
 * A single fake Redis store shared by two separately loaded copies of the module
 * stands in for two deployed instances. It is deliberately not a real Redis: the
 * behaviour that matters here is which backend the module chooses, not the Lua
 * script, which `redis-secondary-storage` owns.
 */

const { redisStore } = vi.hoisted(() => ({
  redisStore: new Map<string, { count: number; expiresAt: number }>(),
}))

vi.mock('@/features/visitor-auth/lib/redis-secondary-storage', () => ({
  redisSecondaryStorage: {
    async incrementWithExpiry(key: string, ttlSeconds: number) {
      const now = Date.now()
      const existing = redisStore.get(key)

      if (!existing || existing.expiresAt <= now) {
        redisStore.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 })
        return { count: 1, ttlSeconds }
      }

      existing.count += 1
      return {
        count: existing.count,
        ttlSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
      }
    },
  },
}))

type CounterModule = typeof import('./rate-limit-counter')

async function loadCounter(env: Record<string, string>): Promise<CounterModule> {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }
  return import('./rate-limit-counter')
}

describe('shared rate-limit counter', () => {
  beforeEach(() => {
    redisStore.clear()
    vi.stubEnv('REDIS_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  describe('outside production', () => {
    it('counts in memory when no Redis is configured', async () => {
      const { incrementCounter } = await loadCounter({ NODE_ENV: 'development' })

      await expect(incrementCounter('k', 60)).resolves.toEqual({ count: 1, ttlSeconds: 60 })
      await expect(incrementCounter('k', 60)).resolves.toMatchObject({ count: 2 })
    })

    it('still prefers Redis when one is configured', async () => {
      const { incrementCounter } = await loadCounter({
        NODE_ENV: 'development',
        REDIS_URL: 'redis://localhost:6379',
      })

      await incrementCounter('k', 60)

      expect(redisStore.get('k')?.count).toBe(1)
    })
  })

  describe('in production', () => {
    it('refuses to count rather than falling back to per-process memory', async () => {
      const { incrementCounter, RateLimitBackendUnavailableError } = await loadCounter({
        NODE_ENV: 'production',
      })

      await expect(incrementCounter('k', 60)).rejects.toBeInstanceOf(
        RateLimitBackendUnavailableError
      )
    })

    it('names REDIS_URL so the misconfiguration is actionable', async () => {
      const { incrementCounter } = await loadCounter({ NODE_ENV: 'production' })

      await expect(incrementCounter('k', 60)).rejects.toThrow(/REDIS_URL/)
    })

    it('counts through Redis when one is configured', async () => {
      const { incrementCounter } = await loadCounter({
        NODE_ENV: 'production',
        REDIS_URL: 'redis://localhost:6379',
      })

      await expect(incrementCounter('k', 60)).resolves.toEqual({ count: 1, ttlSeconds: 60 })
    })
  })

  describe('multi-instance behaviour', () => {
    it('shares one budget across instances when Redis backs the counter', async () => {
      const env = { NODE_ENV: 'production', REDIS_URL: 'redis://localhost:6379' }

      const instanceA = await loadCounter(env)
      await instanceA.incrementCounter('shared', 60)
      await instanceA.incrementCounter('shared', 60)

      // A second module load is a second process: no in-process state carries over.
      const instanceB = await loadCounter(env)

      await expect(instanceB.incrementCounter('shared', 60)).resolves.toMatchObject({ count: 3 })
    })

    it('gives every instance its own budget when counting in memory', async () => {
      const env = { NODE_ENV: 'development' }

      const instanceA = await loadCounter(env)
      await instanceA.incrementCounter('shared', 60)
      await instanceA.incrementCounter('shared', 60)

      const instanceB = await loadCounter(env)

      // This is exactly why the fallback is barred from production: two
      // instances would grant 2x the configured limit, three would grant 3x.
      await expect(instanceB.incrementCounter('shared', 60)).resolves.toMatchObject({ count: 1 })
    })
  })

  describe('resetLocalCounters', () => {
    it('drops in-process counters', async () => {
      const { incrementCounter, resetLocalCounters } = await loadCounter({
        NODE_ENV: 'development',
      })

      await incrementCounter('k', 60)
      resetLocalCounters()

      await expect(incrementCounter('k', 60)).resolves.toMatchObject({ count: 1 })
    })
  })

  describe('getClientIp', () => {
    it('takes the first x-forwarded-for hop', async () => {
      const { getClientIp } = await loadCounter({ NODE_ENV: 'development' })

      expect(getClientIp(new Headers({ 'x-forwarded-for': '192.0.2.1, 10.0.0.1' }))).toBe(
        '192.0.2.1'
      )
    })

    it('falls back to a shared bucket for an unidentifiable caller', async () => {
      const { getClientIp } = await loadCounter({ NODE_ENV: 'development' })

      expect(getClientIp(new Headers())).toBe('unknown')
    })

    // The bypass this replaced: Cloudflare appends the real address to whatever
    // arrived, so the first x-forwarded-for entry is written by the caller.
    it('ignores a forged x-forwarded-for once a trusted proxy is configured', async () => {
      const { getClientIp } = await loadCounter({
        NODE_ENV: 'development',
        TRUSTED_PROXY: 'cloudflare',
      })

      const headers = new Headers({
        'x-forwarded-for': '203.0.113.77',
        'cf-connecting-ip': '192.0.2.1',
      })

      expect(getClientIp(headers)).toBe('192.0.2.1')
    })

    it('does not fall back to a caller-writable header when the trusted one is absent', async () => {
      const { getClientIp } = await loadCounter({
        NODE_ENV: 'development',
        TRUSTED_PROXY: 'cloudflare',
      })

      expect(getClientIp(new Headers({ 'x-forwarded-for': '203.0.113.77' }))).toBe('unknown')
    })

    it('does not split the trusted header, so a comma cannot smuggle an identity', async () => {
      const { getClientIp } = await loadCounter({
        NODE_ENV: 'development',
        TRUSTED_PROXY: 'cloudflare',
      })

      expect(getClientIp(new Headers({ 'cf-connecting-ip': '203.0.113.77, 192.0.2.1' }))).toBe(
        '203.0.113.77, 192.0.2.1'
      )
    })
  })
})
