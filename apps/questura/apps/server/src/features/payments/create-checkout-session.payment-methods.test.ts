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
  // Mutable so a single suite can exercise both sides of the flag; the config
  // module is read at request time, not captured at import.
  features: { endorselyAffiliates: false, stripePromotionCodes: false },
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
    customers: { create: mocks.stripeCustomerCreate, list: mocks.stripeCustomerList },
    subscriptions: { list: mocks.stripeSubscriptionList },
    checkout: { sessions: { create: mocks.stripeCheckoutCreate } },
    prices: { retrieve: mocks.stripePriceRetrieve },
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
    features: mocks.features,
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

import { catalogPriceRetrieve } from './__fixtures__/membership-prices'

import { POST } from '@/app/api/payments/create-checkout-session/route'

let consoleLogSpy: ReturnType<typeof vi.spyOn> | null = null

function createRequest() {
  return new Request('http://localhost:4000/api/payments/create-checkout-session', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }) as any
}

async function sessionParams() {
  const response = await POST(createRequest())
  expect(response.status).toBe(200)
  return mocks.stripeCheckoutCreate.mock.calls[0]
}

describe('create checkout session payment methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Checkout validates the configured price against the catalog before it
    // charges anything, so a session is only created when Stripe returns a
    // price that matches.
    mocks.stripePriceRetrieve.mockImplementation(catalogPriceRetrieve())
    mocks.features.stripePromotionCodes = false
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    mocks.stripeCustomerList.mockResolvedValue({ data: [] })
    mocks.stripeSubscriptionList.mockResolvedValue({ data: [] })
    mocks.updateVisitorProfileByAuthUserId.mockResolvedValue({ id: 10 })
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
    mocks.stripeCheckoutCreate.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.test/session',
    })
  })

  afterEach(() => {
    consoleLogSpy?.mockRestore()
    consoleLogSpy = null
  })

  // `DELIBERATELY_UNHANDLED_STRIPE_EVENTS` leaves
  // `checkout.session.async_payment_failed` unhandled because "Checkout is
  // card-only, so it cannot fire". Nothing in the code enforced that: the list
  // came from the Stripe Dashboard, where this account has bancontact, klarna,
  // cashapp and others switched on. This is the assertion that makes the
  // contract's claim true, so enabling a delayed-notification method in the
  // Dashboard can no longer quietly invalidate it.
  it('sells through card and Link only, whatever the Dashboard has enabled', async () => {
    const [params] = await sessionParams()

    expect(params.payment_method_types).toEqual(['card', 'link'])
  })

  // The point of the list is not the count, it is that nothing on it can
  // complete a session before the money settles. Link is card-backed and
  // settles immediately, so it belongs; anything that reaches recurring through
  // a SEPA-style mandate does not. This assertion is what should fail if a
  // future edit adds a delayed-notification method to the array.
  it('never sells through a delayed-notification method', async () => {
    const [params] = await sessionParams()

    const delayedNotification = [
      'acss_debit', 'au_becs_debit', 'bacs_debit', 'bancontact', 'boleto',
      'ideal', 'sepa_debit', 'sofort', 'us_bank_account',
    ]

    expect(params.payment_method_types).not.toEqual(
      expect.arrayContaining(delayedNotification),
    )
    for (const method of params.payment_method_types ?? []) {
      expect(delayedNotification).not.toContain(method)
    }
  })

  // Omitting the field is the failure this guards: Stripe then falls back to the
  // account's default payment method configuration, which is exactly the
  // Dashboard-controlled list the handlers are not written for.
  it('never leaves the method list to the account default', async () => {
    const [params] = await sessionParams()

    expect(params.payment_method_types).toBeDefined()
  })

  // A delayed method would let a session complete before the money settles, so
  // the mode that decides entitlement has to keep travelling with it.
  it('still creates a subscription, not a one-off payment', async () => {
    const [params] = await sessionParams()

    expect(params.mode).toBe('subscription')
    expect(params.line_items).toEqual([{ price: 'price_123', quantity: 1 }])
  })
})
