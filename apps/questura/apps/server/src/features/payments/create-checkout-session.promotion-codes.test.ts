import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireVisitorPrincipal: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  updateVisitorProfileByAuthUserId: vi.fn(),
  stripeCustomerCreate: vi.fn(),
  stripeCustomerList: vi.fn(),
  stripeSubscriptionList: vi.fn(),
  stripeCheckoutCreate: vi.fn(),
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

describe('create checkout session promotion codes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  // The default matters more than the toggle: `allow_promotion_codes: true`
  // exposes every active code in the account, so an unrestricted 100%-off code
  // becomes a free membership for anyone who learns it.
  it('does not offer the promotion code box by default', async () => {
    const [params] = await sessionParams()

    expect(params.allow_promotion_codes).toBe(false)
  })

  it('offers the promotion code box once the flag is enabled', async () => {
    mocks.features.stripePromotionCodes = true

    const [params] = await sessionParams()

    expect(params.allow_promotion_codes).toBe(true)
  })

  // The flag changes the request body Stripe sees, and Stripe rejects a reused
  // idempotency key whose parameters changed. A deploy that flips the flag
  // inside one replay window would 500 the pay button if the key ignored it.
  it('changes the idempotency key when the flag flips', async () => {
    const [, offOptions] = await sessionParams()

    vi.clearAllMocks()
    mocks.stripeCheckoutCreate.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.test/session',
    })
    mocks.features.stripePromotionCodes = true

    const [, onOptions] = await sessionParams()

    expect(offOptions.idempotencyKey).not.toBe(onOptions.idempotencyKey)
  })
})
