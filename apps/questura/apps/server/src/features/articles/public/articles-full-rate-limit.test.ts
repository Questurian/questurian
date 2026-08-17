import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'
import {
  ARTICLES_FULL_RATE_LIMIT,
  checkArticlesFullRateLimit,
  articlesFullRateLimitResponse,
} from './articles-full-rate-limit'

function headersWithIp(ip: string) {
  return new Headers({ 'x-forwarded-for': ip })
}

describe('articles full rate limit', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    resetLocalCounters()
  })

  it('allows reads under the per-IP ceiling', async () => {
    const headers = headersWithIp('192.0.2.10')

    for (let i = 0; i < ARTICLES_FULL_RATE_LIMIT; i += 1) {
      await expect(checkArticlesFullRateLimit(headers)).resolves.toEqual({ allowed: true })
    }
  })

  it('rejects the next read over the ceiling', async () => {
    const headers = headersWithIp('192.0.2.11')

    for (let i = 0; i < ARTICLES_FULL_RATE_LIMIT; i += 1) {
      await checkArticlesFullRateLimit(headers)
    }

    await expect(checkArticlesFullRateLimit(headers)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: expect.any(Number),
    })
  })

  it('does not share a budget across IPs', async () => {
    const first = headersWithIp('192.0.2.13')
    for (let i = 0; i < ARTICLES_FULL_RATE_LIMIT; i += 1) {
      await checkArticlesFullRateLimit(first)
    }

    await expect(checkArticlesFullRateLimit(headersWithIp('192.0.2.14'))).resolves.toEqual({
      allowed: true,
    })
  })

  it('builds a 429 with Retry-After', async () => {
    const response = articlesFullRateLimitResponse(
      { 'Access-Control-Allow-Origin': 'http://localhost:3000' },
      17
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    await expect(response.json()).resolves.toEqual({
      error: 'Too many attempts. Please try again shortly.',
    })
  })
})
