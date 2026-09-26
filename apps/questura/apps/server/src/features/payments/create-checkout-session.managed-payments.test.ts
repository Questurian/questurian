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
  // Mutable so one suite covers both sides of every switch; the route reads
  // the config at request time.
  features: {
    endorselyAffiliates: false,
    stripePromotionCodes: false,
    stripeForceThreeDSecure: false,
    stripeManagedPayments: false,
  },
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

// A fixed clock, so the time-bucketed idempotency key is reproducible.
const FIXED_NOW = new Date('2026-09-25T12:00:00.000Z')

function createRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost:4000/api/payments/create-checkout-session', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

/** The exact arguments the route handed to `stripe.checkout.sessions.create`. */
async function createCall(body: Record<string, unknown> = {}) {
  const response = await POST(createRequest(body))
  expect(response.status).toBe(200)
  expect(mocks.stripeCheckoutCreate).toHaveBeenCalledTimes(1)
  return mocks.stripeCheckoutCreate.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
}

describe('create checkout session with Managed Payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXED_NOW)
    mocks.stripePriceRetrieve.mockImplementation(catalogPriceRetrieve())
    mocks.features.endorselyAffiliates = false
    mocks.features.stripePromotionCodes = false
    mocks.features.stripeForceThreeDSecure = false
    mocks.features.stripeManagedPayments = false
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
    vi.useRealTimers()
    consoleLogSpy?.mockRestore()
    consoleLogSpy = null
  })

  // Captured from the route before the switch existed (origin/main e89c9874),
  // with the clock above. Off must stay these bytes: the same params in the
  // same order, and the same idempotency key.
  const BEFORE_PLAIN =
    '[{"customer":"cus_123","mode":"subscription","line_items":[{"price":"price_123","quantity":1}],"payment_method_types":["card"],"success_url":"http://localhost:3000/subscription/success?session_id={CHECKOUT_SESSION_ID}&returnTo=%2Faccount","cancel_url":"http://localhost:3000/subscription/cancel","metadata":{"visitorAuthUserId":"visitor_123"},"allow_promotion_codes":false,"billing_address_collection":"auto","subscription_data":{"metadata":{"visitorAuthUserId":"visitor_123"}}},{"idempotencyKey":"checkout:7dd54457d9e5f7dc4ac504c57cae00303c8cd195c564474059993dab2e9ef6b8"}]'
  const BEFORE_EVERY_SWITCH =
    '[{"customer":"cus_123","mode":"subscription","line_items":[{"price":"price_yearly_123","quantity":1}],"payment_method_types":["card"],"success_url":"http://localhost:3000/subscription/success?session_id={CHECKOUT_SESSION_ID}&returnTo=%2Fperu%2Flima","cancel_url":"http://localhost:3000/subscription/cancel","metadata":{"visitorAuthUserId":"visitor_123","endorsely_referral":"ref_abc123"},"allow_promotion_codes":true,"billing_address_collection":"auto","subscription_data":{"metadata":{"visitorAuthUserId":"visitor_123","endorsely_referral":"ref_abc123"}},"payment_method_options":{"card":{"request_three_d_secure":"challenge"}}},{"idempotencyKey":"checkout:cf59306f868ee9f949c0d1bf0ccdc55bfbf14820d93c2ef1c8f5f09f3f4cb985"}]'

  function turnOnEveryOtherSwitch() {
    mocks.features.endorselyAffiliates = true
    mocks.features.stripePromotionCodes = true
    mocks.features.stripeForceThreeDSecure = true
  }
  const EVERY_SWITCH_BODY = { plan: 'yearly', referralId: 'ref_abc123', returnTo: '/peru/lima' }

  describe('off (the default)', () => {
    it('sends exactly the params and key it sent before the switch existed', async () => {
      expect(JSON.stringify(await createCall())).toBe(BEFORE_PLAIN)
    })

    it('stays byte-identical with every other checkout switch on', async () => {
      turnOnEveryOtherSwitch()
      expect(JSON.stringify(await createCall(EVERY_SWITCH_BODY))).toBe(BEFORE_EVERY_SWITCH)
    })

    it('treats a config without the field as off', async () => {
      delete (mocks.features as Partial<typeof mocks.features>).stripeManagedPayments
      expect(JSON.stringify(await createCall())).toBe(BEFORE_PLAIN)
    })
  })

  describe('on', () => {
    beforeEach(() => {
      mocks.features.stripeManagedPayments = true
    })

    it('asks Stripe to be the merchant of record', async () => {
      const [params] = await createCall()
      expect(params.managed_payments).toEqual({ enabled: true })
    })

    // Stripe answers 400 to a managed session carrying any of these.
    it('sends none of the parameters Stripe forbids on a managed session', async () => {
      turnOnEveryOtherSwitch()
      const [params] = await createCall(EVERY_SWITCH_BODY)
      for (const forbidden of [
        'payment_method_types',
        'payment_method_configuration',
        'automatic_tax',
        'tax_id_collection',
        'adaptive_pricing',
        'invoice_creation',
        'shipping_address_collection',
        'shipping_options',
      ]) {
        expect(params, forbidden).not.toHaveProperty(forbidden)
      }
      const subscriptionData = params.subscription_data as Record<string, unknown>
      for (const forbidden of ['default_tax_rates', 'invoice_settings', 'application_fee_percent', 'on_behalf_of', 'transfer_data']) {
        expect(subscriptionData, forbidden).not.toHaveProperty(forbidden)
      }
      expect(params).not.toHaveProperty('customer_update')
    })

    // Everything else is today's session: the same customer, price, mode,
    // URLs, ownership metadata, promotion-code and 3DS choices.
    it('keeps every allowed parameter exactly as the unmanaged session has it', async () => {
      turnOnEveryOtherSwitch()
      const [params] = await createCall(EVERY_SWITCH_BODY)
      const [before] = JSON.parse(BEFORE_EVERY_SWITCH) as [Record<string, unknown>]
      delete before.payment_method_types
      expect(params).toEqual({ ...before, managed_payments: { enabled: true } })
    })

    // Flipping the switch inside the five-minute idempotency window must open
    // a new session, not replay the unmanaged one (Stripe would also refuse a
    // reused key whose parameters changed).
    it('uses a different idempotency key from the unmanaged session', async () => {
      const [, options] = await createCall()
      const [, before] = JSON.parse(BEFORE_PLAIN) as [unknown, { idempotencyKey: string }]
      expect(options.idempotencyKey).toMatch(/^checkout:[0-9a-f]{64}$/)
      expect(options.idempotencyKey).not.toBe(before.idempotencyKey)
    })
  })
})
