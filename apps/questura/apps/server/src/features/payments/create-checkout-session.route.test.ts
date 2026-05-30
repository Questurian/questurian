import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireVisitorPrincipal: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  updateVisitorProfileByAuthUserId: vi.fn(),
  stripeCustomerCreate: vi.fn(),
  stripeCheckoutCreate: vi.fn(),
}))

vi.mock('@/features/visitor-auth/lib/current-principal', () => ({
  requireVisitorPrincipal: mocks.requireVisitorPrincipal,
}))

vi.mock('@/features/visitor-auth/lib/visitor-profile', () => ({
  findVisitorProfileByAuthUserId: mocks.findVisitorProfileByAuthUserId,
  updateVisitorProfileByAuthUserId: mocks.updateVisitorProfileByAuthUserId,
}))

vi.mock('@/payments/lib/stripe', () => ({
  stripe: {
    customers: {
      create: mocks.stripeCustomerCreate,
    },
    checkout: {
      sessions: {
        create: mocks.stripeCheckoutCreate,
      },
    },
  },
}))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    CORS_ORIGINS: ['http://localhost:3000'],
    features: {
      endorselyAffiliates: false,
    },
    stripe: {
      priceId: 'price_123',
    },
  },
  APP_URLS: {
    frontend: 'http://localhost:3000',
    frontendUrl: (path: string) => `http://localhost:3000${path}`,
  },
}))

import { POST } from '@/app/api/payments/create-checkout-session/route'

let consoleLogSpy: ReturnType<typeof vi.spyOn> | null = null

function createRequest() {
  return new Request('http://localhost:4000/api/payments/create-checkout-session', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  }) as any
}

describe('create checkout session route auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      subscriptionStatus: 'none',
    })
    mocks.stripeCustomerCreate.mockResolvedValue({ id: 'cus_123' })
    mocks.stripeCheckoutCreate.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.test/session',
    })
  })

  afterEach(() => {
    consoleLogSpy?.mockRestore()
    consoleLogSpy = null
  })

  it('requires a verified Visitor principal', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      result: { authenticated: false, principal: null },
      principal: null,
      error: 'Email verification required',
      status: 403,
    })

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({
      error: 'Email verification required',
    })
    expect(response.status).toBe(403)
    expect(mocks.requireVisitorPrincipal).toHaveBeenCalledWith(expect.anything(), {
      requireVerified: true,
    })
    expect(mocks.stripeCustomerCreate).not.toHaveBeenCalled()
    expect(mocks.stripeCheckoutCreate).not.toHaveBeenCalled()
  })

  it('creates checkout only for verified Visitor principals', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      result: { authenticated: true },
      principal: {
        kind: 'visitor',
        id: 'visitor_123',
        email: 'visitor@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        profileId: 10,
        emailVerified: true,
      },
      error: null,
      status: 200,
    })

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({
      sessionId: 'cs_123',
      url: 'https://checkout.stripe.test/session',
    })
    expect(response.status).toBe(200)
    expect(mocks.updateVisitorProfileByAuthUserId).toHaveBeenCalledWith('visitor_123', {
      stripeCustomerId: 'cus_123',
    })
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        mode: 'subscription',
        line_items: [{ price: 'price_123', quantity: 1 }],
      }),
    )
  })
})
