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
      endorselyAffiliates: true,
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

import { catalogPriceRetrieve } from './__fixtures__/membership-prices'

import { POST } from '@/app/api/payments/create-checkout-session/route'

let consoleLogSpy: ReturnType<typeof vi.spyOn> | null = null

function createRequest(body: unknown) {
  return new Request('http://localhost:4000/api/payments/create-checkout-session', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }) as any
}

describe('create checkout session referral ID validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Checkout validates the configured price against the catalog before it
    // charges anything, so a session is only created when Stripe returns a
    // price that matches.
    mocks.stripePriceRetrieve.mockImplementation(catalogPriceRetrieve())
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    mocks.stripeCustomerList.mockResolvedValue({ data: [] })
    mocks.stripeSubscriptionList.mockResolvedValue({ data: [] })
    mocks.updateVisitorProfileByAuthUserId.mockResolvedValue({ id: 10 })
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

  async function metadataForBody(body: unknown) {
    const response = await POST(createRequest(body))
    expect(response.status).toBe(200)
    return mocks.stripeCheckoutCreate.mock.calls[0][0].metadata
  }

  it('forwards a valid referral ID into Stripe metadata', async () => {
    const metadata = await metadataForBody({ referralId: '  ref_abc123  ' })

    expect(metadata.endorsely_referral).toBe('ref_abc123')
  })

  // Endorsely mints these server-side and publishes no format, so the charset
  // is deliberately wider than any one guess. Each of these is a shape a real
  // affiliate id plausibly takes, and dropping one costs a commission that
  // nobody is ever told about.
  it.each([
    ['a UUID, the shape of our own Endorsely org id', 'fcadb40c-1e6f-45a3-b69f-709deae165c0'],
    ['a prefixed id', 'ref_abc123'],
    ['a base64url token', 'aGVsbG8td29ybGQ_dGVzdA'],
    ['a padded base64 token', 'aGVsbG8gd29ybGQh+A=='],
    ['a dotted slug', 'acme.partners.eu'],
    ['a colon-namespaced id', 'endorsely:partner:42'],
    ['a value at the length bound', 'a'.repeat(100)],
  ])('accepts %s', async (_label, referralId) => {
    const metadata = await metadataForBody({ referralId })

    expect(metadata.endorsely_referral).toBe(referralId)
  })

  // The value arrives in the request body, so it is attacker-controlled by
  // definition, and it lands in Stripe metadata and the checkout idempotency
  // hash. A newline here is a forged line in a log a human later reads as
  // truth; the invisible characters are there so a lookalike id cannot be
  // planted next to a real one.
  it.each([
    ['a newline', 'ref_abc\nadmin: true'],
    ['a carriage return', 'ref_abc\rref_def'],
    ['a null byte', 'ref_abc\u0000'],
    ['a tab in the middle', 'ref\tabc'],
    ['an inner space', 'ref abc'],
    ['a quote', 'ref_"abc"'],
    ['angle brackets', '<script>alert(1)</script>'],
    ['a backslash', 'ref\\abc'],
    ['a slash', 'ref/../abc'],
    ['an at sign, which would look like an address in metadata', 'visitor@example.com'],
    ['a zero-width space', 'ref_a\u200bbc'],
    ['a right-to-left override', 'ref_a\u202ebc'],
    ['non-ASCII letters', 'réf_abc'],
    ['an emoji', 'ref_abc🎟'],
    ['a percent escape', 'ref%20abc'],
    ['a JSON fragment', '{"$gt":""}'],
  ])('drops a referral ID containing %s', async (_label, referralId) => {
    const metadata = await metadataForBody({ referralId })

    expect(metadata).not.toHaveProperty('endorsely_referral')
  })

  it('drops a referral ID that is only punctuation the set does not allow', async () => {
    const metadata = await metadataForBody({ referralId: '!!!' })

    expect(metadata).not.toHaveProperty('endorsely_referral')
  })

  it('drops non-string referral IDs', async () => {
    const metadata = await metadataForBody({ referralId: { $gt: '' } })

    expect(metadata).not.toHaveProperty('endorsely_referral')
  })

  it('drops referral IDs longer than 100 characters', async () => {
    const metadata = await metadataForBody({ referralId: 'x'.repeat(101) })

    expect(metadata).not.toHaveProperty('endorsely_referral')
  })

  // The length bound is measured after trimming, as it always was: surrounding
  // whitespace must not be what pushes an otherwise-valid id over the edge.
  it('still trims before measuring the length bound', async () => {
    const metadata = await metadataForBody({ referralId: `   ${'y'.repeat(100)}   ` })

    expect(metadata.endorsely_referral).toBe('y'.repeat(100))
  })

  it('drops empty referral IDs', async () => {
    const metadata = await metadataForBody({ referralId: '   ' })

    expect(metadata).not.toHaveProperty('endorsely_referral')
  })

  // Identity travels as the auth user ID alone. The address is on the Stripe
  // customer already, and metadata is the copy that leaks into exports and logs.
  it('keeps the visitor email out of Stripe metadata', async () => {
    const metadata = await metadataForBody({})

    expect(metadata.visitorAuthUserId).toBe('visitor_123')
    expect(metadata).not.toHaveProperty('visitorEmail')
    expect(JSON.stringify(metadata)).not.toContain('@')
  })
})
