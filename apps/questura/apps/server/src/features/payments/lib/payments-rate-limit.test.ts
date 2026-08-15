import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'
import {
  PAYMENTS_RATE_LIMITS,
  checkPaymentsRateLimit,
} from './payments-rate-limit'

function headersWithIp(ip: string) {
  return new Headers({ 'x-forwarded-for': ip })
}

describe('payments rate limit', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    resetLocalCounters()
  })

  it('allows checkout under the per-IP ceiling', async () => {
    const headers = headersWithIp('192.0.2.10')

    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout; i += 1) {
      await expect(checkPaymentsRateLimit(headers, 'checkout')).resolves.toEqual({ allowed: true })
    }
  })

  it('rejects the next checkout over the ceiling', async () => {
    const headers = headersWithIp('192.0.2.11')

    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout; i += 1) {
      await checkPaymentsRateLimit(headers, 'checkout')
    }

    await expect(checkPaymentsRateLimit(headers, 'checkout')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: expect.any(Number),
    })
  })

  it('does not share a budget across scopes', async () => {
    const headers = headersWithIp('192.0.2.12')

    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout; i += 1) {
      await checkPaymentsRateLimit(headers, 'checkout')
    }

    await expect(checkPaymentsRateLimit(headers, 'plans')).resolves.toEqual({ allowed: true })
  })

  it('does not share a budget across IPs', async () => {
    const first = headersWithIp('192.0.2.13')
    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout; i += 1) {
      await checkPaymentsRateLimit(first, 'checkout')
    }

    await expect(checkPaymentsRateLimit(headersWithIp('192.0.2.14'), 'checkout')).resolves.toEqual({
      allowed: true,
    })
  })

  it('builds a 429 with Retry-After', async () => {
    const { paymentsRateLimitResponse } = await import('./payments-rate-limit')
    const response = paymentsRateLimitResponse({ 'Access-Control-Allow-Origin': 'http://localhost:3000' }, 17)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    await expect(response.json()).resolves.toEqual({
      error: 'Too many attempts. Please try again shortly.',
    })
  })
})
