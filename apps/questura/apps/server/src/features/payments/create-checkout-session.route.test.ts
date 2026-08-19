import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireVisitorPrincipal: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  updateVisitorProfileByAuthUserId: vi.fn(),
  stripeCustomerCreate: vi.fn(),
  stripeCustomerList: vi.fn(),
  stripeSubscriptionList: vi.fn(),
  stripeCheckoutCreate: vi.fn(),
  stripePriceRetrieve: vi.fn(),
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
    prices: {
      retrieve: mocks.stripePriceRetrieve,
    },
  },
}))

vi.mock('@/payments/lib/payments-rate-limit', () => ({
  checkPaymentsRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  checkPaymentsVisitorRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  paymentsRateLimitResponse: vi.fn(),
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

import { catalogPrice, catalogPriceRetrieve } from './__fixtures__/membership-prices'

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
    // Checkout validates the configured price against the catalog before it
    // charges anything, so a session is only created when Stripe returns a
    // price that matches.
    mocks.stripePriceRetrieve.mockImplementation(catalogPriceRetrieve())
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
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
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
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
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
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
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
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
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

  it('rejects a cookie session from an untrusted origin before touching Stripe', async () => {
    const response = await POST(
      new Request('http://localhost:4000/api/payments/create-checkout-session', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          cookie: 'questura_visitor.session_token=abc',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }) as any
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Origin not allowed.' })
    expect(mocks.requireVisitorPrincipal).not.toHaveBeenCalled()
    expect(mocks.stripeCheckoutCreate).not.toHaveBeenCalled()
  })
})

/**
 * Checkout used to charge `STRIPE_PRICE_ID_*` straight out of host env.
 *
 * Every check on what that price actually is lived on `/api/payments/plans`,
 * the display path — so a yearly price that really billed monthly, or billed in
 * EUR, or billed $99.99, was dropped from the pricing page with nothing but a
 * log line while this endpoint went on charging it. `/purchase/yearly` posts
 * `{"plan":"yearly"}` without ever loading the pricing page, and the nav
 * Subscribe copy is hardcoded, so a buyer could reach the charge without
 * passing the one check that existed.
 */
describe('create checkout session price validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    mocks.stripePriceRetrieve.mockImplementation(catalogPriceRetrieve())
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

  async function expectRefused(body: Record<string, unknown> = {}) {
    const response = await POST(createRequest(body))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'That plan is not available right now.',
    })
    expect(mocks.stripeCheckoutCreate).not.toHaveBeenCalled()
    return response
  }

  it('refuses to charge a yearly price that actually bills monthly', async () => {
    mocks.stripePriceRetrieve.mockResolvedValue(
      catalogPrice('yearly', 'price_yearly_123', {
        recurring: { interval: 'month', interval_count: 1 },
      })
    )

    await expectRefused({ plan: 'yearly' })
  })

  it('refuses to charge a price billed in another currency', async () => {
    mocks.stripePriceRetrieve.mockResolvedValue(
      catalogPrice('monthly', 'price_123', { currency: 'eur' })
    )

    await expectRefused()
  })

  it('refuses to charge more than the advertised catalog amount', async () => {
    mocks.stripePriceRetrieve.mockResolvedValue(
      catalogPrice('yearly', 'price_yearly_123', { unit_amount: 9999 })
    )

    await expectRefused({ plan: 'yearly' })
  })

  it('refuses to charge a price that is not recurring at all', async () => {
    mocks.stripePriceRetrieve.mockResolvedValue(
      catalogPrice('monthly', 'price_123', { recurring: null })
    )

    await expectRefused()
  })

  it('fails closed when Stripe cannot resolve the configured price', async () => {
    mocks.stripePriceRetrieve.mockRejectedValue(new Error('No such price: price_123'))

    await expectRefused()
  })

  // The refusal has to land before anything is created on the Stripe side.
  // A customer minted for a checkout that is then refused is an orphan row
  // nothing points at.
  it('refuses before creating a Stripe customer', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      subscriptionStatus: 'none',
      stripeCustomerId: null,
    })
    mocks.stripePriceRetrieve.mockResolvedValue(
      catalogPrice('monthly', 'price_123', { unit_amount: 9999 })
    )

    await expectRefused()

    expect(mocks.stripeCustomerCreate).not.toHaveBeenCalled()
    expect(mocks.stripeCustomerList).not.toHaveBeenCalled()
  })

  // The one mismatch that is deliberate: the laptop bills $0.50/month on the
  // same product while the site advertises $12.99. Validation must not break
  // that. See apps/questura/docs/membership-pricing.md.
  it('still sells the cheaper laptop test charge', async () => {
    mocks.stripePriceRetrieve.mockResolvedValue(
      catalogPrice('monthly', 'price_123', { unit_amount: 50 })
    )

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_123', quantity: 1 }] }),
      expect.anything(),
    )
  })

  // The id charged is the validated plan's, not whatever the body asked for a
  // price of — the two must not be able to drift apart.
  it('charges the price id the validated plan carries', async () => {
    await POST(createRequest({ plan: 'yearly' }))

    expect(mocks.stripePriceRetrieve).toHaveBeenCalledWith('price_yearly_123', expect.anything())
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_yearly_123', quantity: 1 }] }),
      expect.anything(),
    )
  })
})
