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
    features: { endorselyAffiliates: false },
    stripe: { priceId: 'price_123', monthlyPriceId: 'price_123', yearlyPriceId: 'price_yearly_123' },
  },
  APP_URLS: {
    frontend: 'http://localhost:3000',
    frontendUrl: (path: string) => `http://localhost:3000${path}`,
  },
}))

import { catalogPriceRetrieve } from './__fixtures__/membership-prices'

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

describe('create checkout session duplicate Stripe customer guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Checkout validates the configured price against the catalog before it
    // charges anything, so a session is only created when Stripe returns a
    // price that matches.
    mocks.stripePriceRetrieve.mockImplementation(catalogPriceRetrieve())
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    mocks.requireVisitorPrincipal.mockResolvedValue({
      result: { authenticated: true },
      principal: {
        kind: 'visitor',
        id: 'visitor_123',
        email: 'visitor@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        profileId: 10,
      },
      error: null,
      status: 200,
    })
    // A blank profile: the auth user survived, the profile row did not, so the
    // Stripe linkage is gone even though the human already exists in Stripe.
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      subscriptionStatus: 'none',
      stripeCustomerId: null,
    })
    mocks.stripeCustomerCreate.mockResolvedValue({ id: 'cus_new' })
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
  })

  it('recovers a customer this visitor owns instead of creating a second one', async () => {
    mocks.stripeCustomerList.mockResolvedValue({
      data: [{ id: 'cus_existing', metadata: { visitorAuthUserId: 'visitor_123' } }],
    })

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(mocks.stripeCustomerList).toHaveBeenCalledWith({
      email: 'visitor@example.com',
      limit: 10,
    })
    expect(mocks.stripeCustomerCreate).not.toHaveBeenCalled()
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
    )
  })

  it('re-links the recovered profile to the recovered customer', async () => {
    mocks.stripeCustomerList.mockResolvedValue({
      data: [{ id: 'cus_existing', metadata: { visitorAuthUserId: 'visitor_123' } }],
    })

    await POST(createRequest())

    expect(mocks.updateVisitorProfileByAuthUserId).toHaveBeenCalledWith('visitor_123', {
      stripeCustomerId: 'cus_existing',
    })
  })

  // The address is not the person. A Stripe customer's email is frozen at
  // creation, so an address a visitor has since changed away from stays on
  // their customer and is free for the next signup to register.
  it('never takes over a customer belonging to a different visitor', async () => {
    mocks.stripeCustomerList.mockResolvedValue({
      data: [{ id: 'cus_someone_else', metadata: { visitorAuthUserId: 'visitor_999' } }],
    })

    await POST(createRequest())

    expect(mocks.stripeCustomerCreate).toHaveBeenCalledTimes(1)
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_new' }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
    )
    expect(mocks.updateVisitorProfileByAuthUserId).toHaveBeenCalledWith('visitor_123', {
      stripeCustomerId: 'cus_new',
    })
  })

  // Customers created by hand in the Dashboard, or imported, carry no ownership
  // metadata. Unclaimed is not the same as ours.
  it('never takes over an unattributed customer', async () => {
    mocks.stripeCustomerList.mockResolvedValue({
      data: [{ id: 'cus_legacy', metadata: {} }, { id: 'cus_legacy_2' }],
    })

    await POST(createRequest())

    expect(mocks.stripeCustomerCreate).toHaveBeenCalledTimes(1)
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_new' }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
    )
  })

  // Duplicates share the address, so the visitor's own customer is not
  // necessarily the newest one Stripe returns.
  it('picks its own customer out of a same-email crowd', async () => {
    mocks.stripeCustomerList.mockResolvedValue({
      data: [
        { id: 'cus_newest_stranger', metadata: { visitorAuthUserId: 'visitor_999' } },
        { id: 'cus_legacy' },
        { id: 'cus_mine', metadata: { visitorAuthUserId: 'visitor_123' } },
      ],
    })

    await POST(createRequest())

    expect(mocks.stripeCustomerCreate).not.toHaveBeenCalled()
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_mine' }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
    )
  })

  it('stamps ownership metadata on every customer it creates', async () => {
    await POST(createRequest())

    expect(mocks.stripeCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'visitor@example.com',
        metadata: { visitorAuthUserId: 'visitor_123', visitorProfileId: '10' },
      })
    )
  })

  // Without a profile row nothing stores the linkage, so the charge that
  // follows would land on a customer no profile points at.
  it('shouts when the linkage cannot be persisted', async () => {
    mocks.updateVisitorProfileByAuthUserId.mockResolvedValue(null)

    await POST(createRequest())

    const logged = consoleLogSpy?.mock.calls.map((args) => args.map(String).join(' ')).join('\n') ?? ''
    expect(logged).toContain('Could not link Stripe customer')
    expect(logged).not.toContain('visitor_123')
    expect(logged).not.toContain('cus_')
  })

  it('creates a customer when the email is genuinely new to Stripe', async () => {
    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(mocks.stripeCustomerCreate).toHaveBeenCalledTimes(1)
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_new' }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
    )
    expect(mocks.updateVisitorProfileByAuthUserId).toHaveBeenCalledWith('visitor_123', {
      stripeCustomerId: 'cus_new',
    })
  })

  it('does not look Stripe up at all when the profile already carries a customer id', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      subscriptionStatus: 'none',
      stripeCustomerId: 'cus_linked',
    })

    await POST(createRequest())

    expect(mocks.stripeCustomerList).not.toHaveBeenCalled()
    expect(mocks.stripeCustomerCreate).not.toHaveBeenCalled()
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_linked' }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:[0-9a-f]{64}$/) }),
    )
  })
})
