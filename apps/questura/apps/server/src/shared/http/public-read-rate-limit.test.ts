import { beforeEach, describe, expect, it, vi } from 'vitest'

const incrementCounter = vi.fn()

vi.mock('@/shared/lib/rate-limit-counter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/rate-limit-counter')>()
  return {
    ...actual,
    get incrementCounter() {
      return incrementCounter
    },
  }
})

vi.mock('@/shared/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const {
  PUBLIC_READ_RATE_LIMITS,
  checkPublicReadRateLimit,
  publicReadRateLimitResponse,
} = await import('./public-read-rate-limit')

beforeEach(() => {
  incrementCounter.mockReset()
})

describe('checkPublicReadRateLimit', () => {
  it('allows a caller inside the scope limit', async () => {
    incrementCounter.mockResolvedValue({ count: PUBLIC_READ_RATE_LIMITS.search, ttlSeconds: 60 })

    expect(await checkPublicReadRateLimit(new Headers(), 'search')).toEqual({ allowed: true })
  })

  it('refuses the request that goes past it', async () => {
    incrementCounter.mockResolvedValue({
      count: PUBLIC_READ_RATE_LIMITS.search + 1,
      ttlSeconds: 42,
    })

    expect(await checkPublicReadRateLimit(new Headers(), 'search')).toEqual({
      allowed: false,
      retryAfterSeconds: 42,
    })
  })

  it('buckets each scope separately', async () => {
    incrementCounter.mockResolvedValue({ count: 1, ttlSeconds: 60 })

    await checkPublicReadRateLimit(new Headers(), 'search')
    await checkPublicReadRateLimit(new Headers(), 'authorPage')

    const [searchKey] = incrementCounter.mock.calls[0] as [string]
    const [authorKey] = incrementCounter.mock.calls[1] as [string]
    expect(searchKey).toContain(':search:')
    expect(authorKey).toContain(':authorPage:')
  })

  // Unlike the payments and articles/full limits, which deny. Those guard
  // money and paid content, where a denial is a retry. These serve public
  // pages to anonymous readers, and denying every reader because Redis
  // blinked turns a cache outage into a site outage.
  it('allows the request when the counter backend is unavailable', async () => {
    incrementCounter.mockRejectedValue(new Error('redis gone'))

    expect(await checkPublicReadRateLimit(new Headers(), 'search')).toEqual({ allowed: true })
  })
})

describe('publicReadRateLimitResponse', () => {
  it('says when to come back and refuses to be cached', async () => {
    const response = publicReadRateLimitResponse(30)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('30')
    // A 429 is about one caller right now; caching it applies it to everyone
    // sharing the cache.
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
