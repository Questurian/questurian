import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Launch harness A5: the checkout route, attacked.
 *
 * Everything in the body is the caller's to write. The route turns it into a
 * Stripe Checkout Session, and the success URL comes back to a browser after
 * payment. So a hostile value must never become an off-site redirect, a
 * surprise plan, extra metadata, or a crash. The double click and the second
 * live subscription are covered end to end by `pnpm readiness:purchase`.
 */

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

vi.mock('@/features/visitor-auth/lib/current-principal', () => ({ requireVisitorPrincipal: mocks.requireVisitorPrincipal }))
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
    CORS_ORIGINS: ['https://www.questurian.com'],
    features: { endorselyAffiliates: true },
    stripe: { priceId: 'price_123', monthlyPriceId: 'price_123', yearlyPriceId: 'price_yearly_123' },
  },
  APP_URLS: {
    frontend: 'https://www.questurian.com',
    frontendUrl: (path: string) => `https://www.questurian.com${path}`,
  },
}))

import { catalogPriceRetrieve } from './__fixtures__/membership-prices'

import { POST } from '@/app/api/payments/create-checkout-session/route'

const SITE = 'https://www.questurian.com'

function request(body: unknown, contentType = 'application/json') {
  return new Request('https://api.questurian.com/api/payments/create-checkout-session', {
    method: 'POST',
    headers: { origin: SITE, 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as any
}

/** The Checkout Session parameters the route sent Stripe, if it sent any. */
function sessionParams(): Record<string, any> | undefined {
  return mocks.stripeCheckoutCreate.mock.calls[0]?.[0]
}

/**
 * Where the reader lands after paying: the success page reads `returnTo`
 * from its URL (one decode), then the client guard decodes it again. Follow
 * that exact chain and resolve it the way the browser will.
 */
function landing(successUrl: string): string {
  const withId = successUrl.replace('{CHECKOUT_SESSION_ID}', 'cs_test')
  const returnTo = new URL(withId).searchParams.get('returnTo') ?? '/'
  let path = returnTo
  try {
    path = decodeURIComponent(returnTo)
  } catch {
    path = '/'
  }
  return new URL(path, `${SITE}/subscription/success`).href
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.stripePriceRetrieve.mockImplementation(catalogPriceRetrieve())
  mocks.requireVisitorPrincipal.mockResolvedValue({
    principal: { kind: 'visitor', id: 'visitor_1', email: 'reader@example.com', profileId: 10, firstName: 'A', lastName: 'B' },
  })
  mocks.findVisitorProfileByAuthUserId.mockResolvedValue({ id: 10, stripeCustomerId: 'cus_1' })
  mocks.stripeCustomerList.mockResolvedValue({ data: [] })
  mocks.stripeSubscriptionList.mockResolvedValue({ data: [] })
  mocks.updateVisitorProfileByAuthUserId.mockResolvedValue({ id: 10 })
  mocks.stripeCheckoutCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' })
})

describe('returnTo, attacked', () => {
  it.each([
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil.example'],
    ['encoded slashes', '%2F%2Fevil.example'],
    ['double-encoded slashes', '/%252F%252Fevil.example'],
    ['encoded backslash', '/%5Cevil.example'],
    ['double-encoded backslash', '/%255Cevil.example'],
    ['tab trick', '/\t/evil.example'],
    ['double-encoded tab trick', '/%2509/evil.example'],
    ['javascript:', 'javascript:alert(1)'],
    ['absolute URL', 'https://evil.example/account'],
    ['full-width slash', '／／evil.example'],
    ['fraction slash', '/⁄evil.example'],
    ['division slash', '/∕evil.example'],
    ['CRLF', '/account\r\nSet-Cookie: x=1'],
    ['very long', `/${'a'.repeat(100_000)}`],
    ['not a string', { toString: 'x' }],
    ['a number', 42],
    ['an array', ['/account']],
  ])('%s never lands off the site', async (_label, returnTo) => {
    const response = await POST(request({ plan: 'monthly', returnTo }))

    expect(response.status).toBe(200)
    const params = sessionParams()!
    expect(new URL(landing(params.success_url)).origin).toBe(SITE)
    expect(params.success_url).not.toMatch(/[\r\n]/)
  })

  it('keeps an ordinary on-site path', async () => {
    await POST(request({ plan: 'monthly', returnTo: '/peru/lima/articles/x?y=1' }))

    expect(landing(sessionParams()!.success_url)).toBe(`${SITE}/peru/lima/articles/x?y=1`)
  })
})

describe('plan, attacked', () => {
  // Anything that is not exactly a known plan id is the monthly plan: the
  // buyer still sees the price on Stripe's page before paying.
  it.each([['unknown', 'lifetime'], ['array', ['yearly']], ['object', { id: 'yearly' }], ['number', 1], ['case', 'YEARLY'], ['padded', ' yearly ']])(
    'an %s plan becomes monthly, never another price',
    async (_label, plan) => {
      await POST(request({ plan }))

      expect(sessionParams()!.line_items).toEqual([{ price: 'price_123', quantity: 1 }])
    },
  )

  it('yearly is yearly', async () => {
    await POST(request({ plan: 'yearly' }))

    expect(sessionParams()!.line_items).toEqual([{ price: 'price_yearly_123', quantity: 1 }])
  })

  it('a caller cannot choose the price, quantity or mode directly', async () => {
    await POST(
      request({
        plan: 'monthly',
        price: 'price_free',
        priceId: 'price_free',
        quantity: 100,
        line_items: [{ price: 'price_free', quantity: 1 }],
        mode: 'payment',
        allow_promotion_codes: true,
        customer: 'cus_someone_else',
      }),
    )

    const params = sessionParams()!
    expect(params.line_items).toEqual([{ price: 'price_123', quantity: 1 }])
    expect(params.mode).toBe('subscription')
    expect(params.customer).toBe('cus_1')
    expect(params.allow_promotion_codes).not.toBe(true)
  })
})

describe('referralId, attacked', () => {
  it.each([
    ['an address', 'someone@example.com'],
    ['a newline', 'ref\nx'],
    ['a slash', 'ref/../x'],
    ['101 characters', 'r'.repeat(101)],
    ['an object', { id: 'ref' }],
    ['an array', ['ref']],
    ['blank', '   '],
  ])('%s is dropped, not stored', async (_label, referralId) => {
    const response = await POST(request({ plan: 'monthly', referralId }))

    expect(response.status).toBe(200)
    const params = sessionParams()!
    expect(params.metadata).toEqual({ visitorAuthUserId: 'visitor_1' })
    expect(params.subscription_data.metadata).toEqual({ visitorAuthUserId: 'visitor_1' })
  })

  it('a plain id is kept, in both metadata copies', async () => {
    await POST(request({ plan: 'monthly', referralId: 'ref_abc-123' }))

    expect(sessionParams()!.metadata.endorsely_referral).toBe('ref_abc-123')
    expect(sessionParams()!.subscription_data.metadata.endorsely_referral).toBe('ref_abc-123')
  })

  it('metadata never carries the email address', async () => {
    await POST(request({ plan: 'monthly', referralId: 'ref_1', email: 'reader@example.com' }))

    expect(JSON.stringify(sessionParams()!.metadata)).not.toContain('@')
  })
})

describe('the body itself, attacked', () => {
  it.each([
    ['not JSON', 'plan=yearly', 'application/x-www-form-urlencoded'],
    ['broken JSON', '{"plan": "yearly"', 'application/json'],
    ['JSON null', 'null', 'application/json'],
    ['a JSON string', '"yearly"', 'application/json'],
    ['a JSON array', '[{"plan":"yearly"}]', 'application/json'],
    ['empty', '', 'application/json'],
    ['a prototype key', '{"__proto__":{"plan":"yearly"},"constructor":{"prototype":{"x":1}}}', 'application/json'],
  ])('%s falls back to the monthly defaults without crashing', async (_label, body, contentType) => {
    const response = await POST(request(body, contentType))

    expect(response.status).toBe(200)
    expect(sessionParams()!.line_items).toEqual([{ price: 'price_123', quantity: 1 }])
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})
