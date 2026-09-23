import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * Launch harness A6, run against the five cookie-authenticated payment routes
 * through their real handlers.
 *
 * 1. **Cross-user.** A signed-in visitor A sends B's ids (subscription,
 *    customer, user, profile, email) in the body and in the query. Every route
 *    must act on A's own records and never pass B's ids to a service or to
 *    Stripe. The routes are written to take the caller only from the session.
 *    This pins that, so a later "convenience" parameter cannot slip in.
 * 2. **Origin.** A request that carries a cookie is refused unless its
 *    `Origin` is exactly one of this deployment's origins. That includes a
 *    missing Origin, `null`, a "simple" `text/plain` POST from another site,
 *    and look-alikes that only share a prefix or suffix. The refusal comes
 *    before the rate limiter or the session is touched.
 *
 * `cookie-auth-origin-guard.test.ts` pins the guard on the source. This
 * checks what the routes do.
 */

const SITE = 'https://www.questurian.com'

const A = {
  id: 'visitor_A',
  profileId: 'profile_A',
  email: 'a@example.test',
  firstName: 'Ada',
  lastName: 'Able',
}
const A_PROFILE = {
  id: 'profile_A',
  stripeCustomerId: 'cus_A',
  stripeSubscriptionId: 'sub_A',
}

const B_IDS = {
  subscriptionId: 'sub_B',
  stripeSubscriptionId: 'sub_B',
  customerId: 'cus_B',
  stripeCustomerId: 'cus_B',
  customer: 'cus_B',
  userId: 'visitor_B',
  visitorId: 'visitor_B',
  authUserId: 'visitor_B',
  profileId: 'profile_B',
  email: 'b@example.test',
}
const B_VALUES = [...new Set(Object.values(B_IDS))]

const mocks = vi.hoisted(() => ({
  requireVisitorPrincipal: vi.fn(),
  checkPaymentsRateLimit: vi.fn(),
  checkPaymentsVisitorRateLimit: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  updateVisitorProfileByAuthUserId: vi.fn(),
  resolveStripeCustomerForVisitor: vi.fn(),
  findLiveSubscription: vi.fn(),
  getPurchasablePlan: vi.fn(),
  cancelUserSubscription: vi.fn(),
  reactivateUserSubscription: vi.fn(),
  getStripeSubscriptionDetails: vi.fn(),
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
}))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    CORS_ORIGINS: ['https://www.questurian.com', 'https://questurian.com'],
    features: { endorselyAffiliates: true, checkoutPromotionCodes: false },
    stripe: { portalReturnUrl: '' },
  },
  APP_URLS: {
    frontend: 'https://www.questurian.com',
    frontendUrl: (path: string) => `https://www.questurian.com${path}`,
  },
}))

vi.mock('@/features/visitor-auth/lib/current-principal', () => ({
  requireVisitorPrincipal: mocks.requireVisitorPrincipal,
}))

vi.mock('@/payments/lib/payments-rate-limit', () => ({
  checkPaymentsRateLimit: mocks.checkPaymentsRateLimit,
  checkPaymentsVisitorRateLimit: mocks.checkPaymentsVisitorRateLimit,
  paymentsRateLimitResponse: () => new Response(null, { status: 429 }),
}))

vi.mock('@/features/visitor-auth/lib/visitor-profile', () => ({
  findVisitorProfileByAuthUserId: mocks.findVisitorProfileByAuthUserId,
  updateVisitorProfileByAuthUserId: mocks.updateVisitorProfileByAuthUserId,
}))

vi.mock('@/payments/lib/customer-linkage', () => ({
  resolveStripeCustomerForVisitor: mocks.resolveStripeCustomerForVisitor,
  findLiveSubscription: mocks.findLiveSubscription,
}))

vi.mock('@/payments/lib/membership-plans', () => ({
  isPlanId: (value: unknown) => value === 'monthly' || value === 'yearly',
  getPurchasablePlan: mocks.getPurchasablePlan,
}))

vi.mock('@/payments/lib/payment-service', () => ({
  cancelUserSubscription: mocks.cancelUserSubscription,
  reactivateUserSubscription: mocks.reactivateUserSubscription,
  getStripeSubscriptionDetails: mocks.getStripeSubscriptionDetails,
}))

vi.mock('@/payments/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: mocks.checkoutCreate } },
    billingPortal: { sessions: { create: mocks.portalCreate } },
  },
}))

import { POST as checkout } from './create-checkout-session/route'
import { POST as portal } from './create-portal-session/route'
import { POST as cancel } from './cancel-subscription/route'
import { POST as reactivate } from './reactivate-subscription/route'
import { GET as details } from './subscription-details/route'

type Handler = (req: NextRequest) => Promise<Response>

const ROUTES: Array<{ name: string; method: 'GET' | 'POST'; handler: Handler }> = [
  { name: 'create-checkout-session', method: 'POST', handler: checkout as Handler },
  { name: 'create-portal-session', method: 'POST', handler: portal as Handler },
  { name: 'cancel-subscription', method: 'POST', handler: cancel as Handler },
  { name: 'reactivate-subscription', method: 'POST', handler: reactivate as Handler },
  { name: 'subscription-details', method: 'GET', handler: details as Handler },
]

function request(
  route: (typeof ROUTES)[number],
  options: {
    origin?: string | null
    cookie?: string | null
    contentType?: string
    body?: Record<string, unknown> | string
    query?: Record<string, string>
  } = {},
): NextRequest {
  const url = new URL(`https://api.questurian.com/api/payments/${route.name}`)
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value)

  const headers = new Headers()
  const origin = options.origin === undefined ? SITE : options.origin
  const cookie = options.cookie === undefined ? 'questura_visitor.session_token=A' : options.cookie
  if (origin !== null) headers.set('origin', origin)
  if (cookie !== null) headers.set('cookie', cookie)
  headers.set('content-type', options.contentType ?? 'application/json')

  const body =
    route.method === 'GET'
      ? undefined
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body ?? {})

  const req = new Request(url, { method: route.method, headers, body })
  // The routes read `nextUrl` nowhere today; give them one anyway so a future
  // query read sees the hostile parameters rather than crashing.
  return Object.assign(req, { nextUrl: url }) as unknown as NextRequest
}

/** Every argument any service or Stripe mock was called with, as one string. */
function everythingPassedDownstream(): string {
  return JSON.stringify(
    Object.entries(mocks)
      .filter(([name]) => name !== 'requireVisitorPrincipal')
      .map(([, mock]) => mock.mock.calls),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)

  mocks.requireVisitorPrincipal.mockResolvedValue({ principal: A })
  mocks.checkPaymentsRateLimit.mockResolvedValue({ allowed: true })
  mocks.checkPaymentsVisitorRateLimit.mockResolvedValue({ allowed: true })
  mocks.findVisitorProfileByAuthUserId.mockResolvedValue(A_PROFILE)
  mocks.updateVisitorProfileByAuthUserId.mockResolvedValue(true)
  mocks.resolveStripeCustomerForVisitor.mockResolvedValue({ customerId: 'cus_A', created: false })
  mocks.findLiveSubscription.mockResolvedValue(null)
  mocks.getPurchasablePlan.mockResolvedValue({ id: 'monthly', priceId: 'price_monthly' })
  mocks.cancelUserSubscription.mockResolvedValue({ success: true, message: 'ok', membershipExpiresAt: null })
  mocks.reactivateUserSubscription.mockResolvedValue({ success: true, message: 'ok' })
  mocks.getStripeSubscriptionDetails.mockResolvedValue({
    status: 'active',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  })
  mocks.checkoutCreate.mockResolvedValue({ id: 'cs_A', url: 'https://checkout.stripe.com/c/cs_A' })
  mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p/A' })
})

describe.each(ROUTES)('$name', (route) => {
  describe('cross-user ids are ignored', () => {
    it('acts for the signed-in visitor, with B named in body and query', async () => {
      const response = await route.handler(
        request(route, {
          body: { plan: 'monthly', returnTo: '/account', ...B_IDS },
          query: Object.fromEntries(Object.entries(B_IDS).map(([k, v]) => [k, String(v)])),
        }),
      )

      expect(response.status, await response.clone().text()).toBeLessThan(400)
      expect(mocks.requireVisitorPrincipal).toHaveBeenCalledOnce()

      const downstream = everythingPassedDownstream()
      for (const value of B_VALUES) expect(downstream, value).not.toContain(value)
      expect(downstream).toContain(A.id)
    })
  })

  describe('origin guard', () => {
    it('allows the site origin', async () => {
      const response = await route.handler(request(route, { body: { plan: 'monthly' } }))

      expect(response.status).toBeLessThan(400)
    })

    it.each([
      ['no Origin header', null],
      ['Origin: null (sandboxed frame, data: URL, redirect chain)', 'null'],
      ['a foreign site', 'https://evil.example'],
      ['a suffix look-alike', 'https://www.questurian.com.evil.io'],
      ['a prefix look-alike', 'https://evil-www.questurian.com'],
      ['an unlisted sibling subdomain', 'https://preview.questurian.com'],
      ['the site over plain http', 'http://www.questurian.com'],
      ['the site on another port', 'https://www.questurian.com:8443'],
      ['the site with a trailing slash', 'https://www.questurian.com/'],
      ['the site with a trailing dot', 'https://www.questurian.com.'],
      ['the site in upper case', 'HTTPS://WWW.QUESTURIAN.COM'],
      ['two origins', 'https://www.questurian.com https://evil.example'],
      ['an empty Origin', ''],
    ])('refuses a cookie request with %s', async (_label, origin) => {
      const response = await route.handler(request(route, { origin, body: { plan: 'monthly' } }))

      expect(response.status).toBe(403)
      expect(mocks.checkPaymentsRateLimit).not.toHaveBeenCalled()
      expect(mocks.requireVisitorPrincipal).not.toHaveBeenCalled()
      expect(everythingPassedDownstream()).not.toContain('visitor_A')
    })

    // The classic CSRF form: a cross-site "simple" request needs no preflight,
    // so the only thing stopping it is the Origin check.
    it('refuses a cross-site text/plain POST that carries a cookie', async () => {
      const response = await route.handler(
        request(route, {
          origin: 'https://evil.example',
          contentType: 'text/plain',
          body: '{"plan":"monthly"}',
        }),
      )

      expect(response.status).toBe(403)
      expect(mocks.requireVisitorPrincipal).not.toHaveBeenCalled()
    })

    it('does not reflect a refused origin in CORS headers', async () => {
      const response = await route.handler(request(route, { origin: 'https://evil.example' }))

      expect(response.headers.get('access-control-allow-origin')).toBeNull()
      expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    })

    // Stricter than CSRF needs: without a cookie there is no ambient
    // credential, yet a foreign Origin is still refused outright.
    it('refuses a foreign origin even without a cookie', async () => {
      const response = await route.handler(
        request(route, { origin: 'https://evil.example', cookie: null }),
      )

      expect(response.status).toBe(403)
      expect(mocks.requireVisitorPrincipal).not.toHaveBeenCalled()
    })

    // No cookie and no Origin (curl, a server): nothing to forge, so the
    // session check decides, and without a session it refuses.
    it('sends a cookieless, originless request to the session check', async () => {
      mocks.requireVisitorPrincipal.mockResolvedValue({ error: 'Not signed in', status: 401 })

      const response = await route.handler(request(route, { origin: null, cookie: null }))

      expect(response.status).toBe(401)
    })
  })
})
