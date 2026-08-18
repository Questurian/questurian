import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'
import {
  PAYMENTS_RATE_LIMITS,
  checkPaymentsRateLimit,
  checkPaymentsVisitorRateLimit,
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

    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.ip; i += 1) {
      await expect(checkPaymentsRateLimit(headers, 'checkout')).resolves.toEqual({ allowed: true })
    }
  })

  it('rejects the next checkout over the ceiling', async () => {
    const headers = headersWithIp('192.0.2.11')

    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.ip; i += 1) {
      await checkPaymentsRateLimit(headers, 'checkout')
    }

    await expect(checkPaymentsRateLimit(headers, 'checkout')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: expect.any(Number),
    })
  })

  it('does not share a budget across scopes', async () => {
    const headers = headersWithIp('192.0.2.12')

    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.ip; i += 1) {
      await checkPaymentsRateLimit(headers, 'checkout')
    }

    await expect(checkPaymentsRateLimit(headers, 'plans')).resolves.toEqual({ allowed: true })
  })

  it('does not share a budget across IPs', async () => {
    const first = headersWithIp('192.0.2.13')
    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.ip; i += 1) {
      await checkPaymentsRateLimit(first, 'checkout')
    }

    await expect(checkPaymentsRateLimit(headersWithIp('192.0.2.14'), 'checkout')).resolves.toEqual({
      allowed: true,
    })
  })

  it('rejects the next checkout after one visitor hits the ceiling, even from a fresh IP', async () => {
    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.visitor; i += 1) {
      await expect(
        checkPaymentsVisitorRateLimit('visitor_nat_a', 'checkout')
      ).resolves.toEqual({ allowed: true })
    }

    await expect(checkPaymentsVisitorRateLimit('visitor_nat_a', 'checkout')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: expect.any(Number),
    })
  })

  it('does not share a visitor budget across visitors', async () => {
    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.visitor; i += 1) {
      await checkPaymentsVisitorRateLimit('visitor_a', 'checkout')
    }

    await expect(checkPaymentsVisitorRateLimit('visitor_b', 'checkout')).resolves.toEqual({
      allowed: true,
    })
  })

  it('does not share a visitor budget across scopes', async () => {
    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.visitor; i += 1) {
      await checkPaymentsVisitorRateLimit('visitor_scope', 'checkout')
    }

    await expect(checkPaymentsVisitorRateLimit('visitor_scope', 'portal')).resolves.toEqual({
      allowed: true,
    })
  })

  it('lets two visitors behind one NAT IP each spend a full checkout budget', async () => {
    const nat = headersWithIp('192.0.2.50')

    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.visitor; i += 1) {
      await expect(checkPaymentsRateLimit(nat, 'checkout')).resolves.toEqual({ allowed: true })
      await expect(checkPaymentsVisitorRateLimit('visitor_nat_1', 'checkout')).resolves.toEqual({
        allowed: true,
      })
    }

    for (let i = 0; i < PAYMENTS_RATE_LIMITS.checkout.visitor; i += 1) {
      await expect(checkPaymentsRateLimit(nat, 'checkout')).resolves.toEqual({ allowed: true })
      await expect(checkPaymentsVisitorRateLimit('visitor_nat_2', 'checkout')).resolves.toEqual({
        allowed: true,
      })
    }
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
