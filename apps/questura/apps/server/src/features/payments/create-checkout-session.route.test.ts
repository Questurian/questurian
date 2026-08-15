import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireVisitorPrincipal: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  updateVisitorProfileByAuthUserId: vi.fn(),
  stripeCustomerCreate: vi.fn(),
  stripeCustomerList: vi.fn(),
  stripeSubscriptionList: vi.fn(),
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
      list: mocks.stripeCustomerList,
    },
    subscriptions: {
      list: mocks.stripeSubscriptionList,
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
      monthlyPriceId: 'price_123',
      yearlyPriceId: 'price_yearly_123',
    },
  },
  APP_URLS: {
    frontend: 'http://localhost:3000',
    frontendUrl: (path: string) => `http://localhost:3000${path}`,
  },
}))

import { POST } from '@/app/api/payments/create-checkout-session/route'

let consoleLogSpy: ReturnType<typeof vi.spyOn> | null = null

function createRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost:4000/api/payments/create-checkout-session', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
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
    mocks.stripeCustomerList.mockResolvedValue({ data: [] })
    mocks.stripeSubscriptionList.mockResolvedValue({ data: [] })
    mocks.updateVisitorProfileByAuthUserId.mockResolvedValue({ id: 10 })
    mocks.stripeCheckoutCreate.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.test/session',
    })
  })

  afterEach(() => {
    consoleLogSpy?.mockRestore()
    consoleLogSpy = null
  })

  it('rejects an unauthenticated request', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      result: { authenticated: false, principal: null },
      principal: null,
      error: 'Authentication required',
      status: 401,
    })

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required',
    })
    expect(response.status).toBe(401)
    expect(mocks.stripeCustomerCreate).not.toHaveBeenCalled()
    expect(mocks.stripeCheckoutCreate).not.toHaveBeenCalled()
  })

  it('does not require a verified email to start checkout', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      result: { authenticated: true },
      principal: {
        kind: 'visitor',
        id: 'visitor_123',
        email: 'visitor@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        profileId: 10,
        emailVerified: false,
      },
      error: null,
      status: 200,
    })

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalled()
    // The gate is gone at the call site, not just satisfied by the mock: the
    // route must not ask for verification at all.
    expect(mocks.requireVisitorPrincipal).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requireVerified: true })
    )
  })

  it('creates checkout for an authenticated Visitor principal', async () => {
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

  it('charges the monthly price when no plan is given', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      principal: { id: 'visitor_123', email: 'visitor@example.com', profileId: 10 },
      error: null,
      status: 200,
    })

    await POST(createRequest())

    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_123', quantity: 1 }] }),
    )
  })

  it('charges the yearly price when the yearly plan is chosen', async () => {
    // The regression this guards: both purchase pages hit one endpoint that
    // always used a single monthly price, so the "Annual Plan" billed monthly.
    mocks.requireVisitorPrincipal.mockResolvedValue({
      principal: { id: 'visitor_123', email: 'visitor@example.com', profileId: 10 },
      error: null,
      status: 200,
    })

    await POST(createRequest({ plan: 'yearly' }))

    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_yearly_123', quantity: 1 }] }),
    )
  })

  it('falls back to monthly rather than trusting an unknown plan value', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      principal: { id: 'visitor_123', email: 'visitor@example.com', profileId: 10 },
      error: null,
      status: 200,
    })

    await POST(createRequest({ plan: 'lifetime-free' }))

    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_123', quantity: 1 }] }),
    )
  })

  it('refuses checkout when Stripe already has a past_due subscription', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      principal: { id: 'visitor_123', email: 'visitor@example.com', profileId: 10 },
      error: null,
      status: 200,
    })
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      subscriptionStatus: 'past_due',
      stripeCustomerId: 'cus_123',
    })
    mocks.stripeSubscriptionList.mockResolvedValue({
      data: [{ id: 'sub_dunning', status: 'past_due' }],
    })

    const response = await POST(createRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Visitor already has an active subscription',
    })
    expect(mocks.stripeCheckoutCreate).not.toHaveBeenCalled()
  })

  it('refuses checkout when Stripe is live even if the local profile looks empty', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      principal: { id: 'visitor_123', email: 'visitor@example.com', profileId: 10 },
      error: null,
      status: 200,
    })
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      subscriptionStatus: 'none',
      stripeCustomerId: 'cus_123',
    })
    mocks.stripeSubscriptionList.mockResolvedValue({
      data: [{ id: 'sub_live', status: 'active' }],
    })

    const response = await POST(createRequest())

    expect(response.status).toBe(400)
    expect(mocks.stripeCheckoutCreate).not.toHaveBeenCalled()
  })

  it('allows checkout after the only Stripe subscription is canceled', async () => {
    mocks.requireVisitorPrincipal.mockResolvedValue({
      principal: { id: 'visitor_123', email: 'visitor@example.com', profileId: 10 },
      error: null,
      status: 200,
    })
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      subscriptionStatus: 'cancelled',
      stripeCustomerId: 'cus_123',
    })
    mocks.stripeSubscriptionList.mockResolvedValue({
      data: [{ id: 'sub_old', status: 'canceled' }],
    })

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalled()
  })
})
