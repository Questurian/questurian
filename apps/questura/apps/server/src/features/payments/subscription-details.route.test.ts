import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireVisitorPrincipal: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  getStripeSubscriptionDetails: vi.fn(),
  checkPaymentsRateLimit: vi.fn(),
  checkPaymentsVisitorRateLimit: vi.fn(),
}))

vi.mock('@/features/visitor-auth/lib/current-principal', () => ({
  requireVisitorPrincipal: mocks.requireVisitorPrincipal,
}))

vi.mock('@/features/visitor-auth/lib/visitor-profile', () => ({
  findVisitorProfileByAuthUserId: mocks.findVisitorProfileByAuthUserId,
}))

vi.mock('@/payments/lib/payment-service', () => ({
  getStripeSubscriptionDetails: mocks.getStripeSubscriptionDetails,
}))

vi.mock('@/payments/lib/payments-rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/payments/lib/payments-rate-limit')>()
  return {
    ...actual,
    checkPaymentsRateLimit: mocks.checkPaymentsRateLimit,
    checkPaymentsVisitorRateLimit: mocks.checkPaymentsVisitorRateLimit,
  }
})

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    CORS_ORIGINS: ['http://localhost:3000'],
  },
}))

import { GET } from '@/app/api/payments/subscription-details/route'

function createRequest(headers: Record<string, string>) {
  return new Request('http://localhost:4000/api/payments/subscription-details', {
    method: 'GET',
    headers,
  }) as never
}

describe('subscription-details route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkPaymentsRateLimit.mockResolvedValue({ allowed: true })
    mocks.checkPaymentsVisitorRateLimit.mockResolvedValue({ allowed: true })
    mocks.requireVisitorPrincipal.mockResolvedValue({ principal: { id: 'visitor_1' } })
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      stripeSubscriptionId: 'sub_123',
      subscriptionStatus: 'active',
      paidThroughAt: '2026-09-01T00:00:00.000Z',
      dunningGraceUntil: null,
    })
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      status: 'active',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      currentPeriodStart: '2026-08-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    })
  })

  // This route reads a visitor's billing state from an ambient cookie, so the
  // origin has to be on the allowlist before the session is even resolved.
  it('rejects a cookie session from an untrusted origin before resolving the visitor', async () => {
    const response = await GET(
      createRequest({
        origin: 'https://evil.example',
        cookie: 'questura_visitor.session_token=abc',
      })
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Origin not allowed.' })
    expect(mocks.requireVisitorPrincipal).not.toHaveBeenCalled()
    expect(mocks.getStripeSubscriptionDetails).not.toHaveBeenCalled()
  })

  it('rejects a cookie session carrying no origin at all', async () => {
    const response = await GET(
      createRequest({ cookie: 'questura_visitor.session_token=abc' })
    )

    expect(response.status).toBe(403)
    expect(mocks.requireVisitorPrincipal).not.toHaveBeenCalled()
  })

  it('429s the IP bucket before resolving the visitor', async () => {
    mocks.checkPaymentsRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 })

    const response = await GET(
      createRequest({
        origin: 'http://localhost:3000',
        cookie: 'questura_visitor.session_token=abc',
      })
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    expect(mocks.requireVisitorPrincipal).not.toHaveBeenCalled()
    expect(mocks.checkPaymentsVisitorRateLimit).not.toHaveBeenCalled()
  })

  it('429s the visitor bucket after resolving the session', async () => {
    mocks.checkPaymentsVisitorRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 17,
    })

    const response = await GET(
      createRequest({
        origin: 'http://localhost:3000',
        cookie: 'questura_visitor.session_token=abc',
      })
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    expect(mocks.requireVisitorPrincipal).toHaveBeenCalled()
    expect(mocks.getStripeSubscriptionDetails).not.toHaveBeenCalled()
  })

  it('serves the visitor their own subscription from an allowed origin', async () => {
    const response = await GET(
      createRequest({
        origin: 'http://localhost:3000',
        cookie: 'questura_visitor.session_token=abc',
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      subscriptionId: 'sub_123',
      internalStatus: 'active',
      paidThroughAt: '2026-09-01T00:00:00.000Z',
    })
  })
})
