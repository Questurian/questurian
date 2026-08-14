import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireVisitorPrincipal: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  updateVisitorProfileByAuthUserId: vi.fn(),
  stripeCustomerCreate: vi.fn(),
  stripeCustomerList: vi.fn(),
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
    features: { endorselyAffiliates: false },
    stripe: { priceId: 'price_123', monthlyPriceId: 'price_123', yearlyPriceId: 'price_yearly_123' },
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

describe('create checkout session duplicate Stripe customer guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    mocks.stripeCheckoutCreate.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.test/session',
    })
  })

  afterEach(() => {
    consoleLogSpy?.mockRestore()
  })

  it('adopts an existing Stripe customer instead of creating a second one', async () => {
    mocks.stripeCustomerList.mockResolvedValue({ data: [{ id: 'cus_existing' }] })

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(mocks.stripeCustomerList).toHaveBeenCalledWith({
      email: 'visitor@example.com',
      limit: 1,
    })
    expect(mocks.stripeCustomerCreate).not.toHaveBeenCalled()
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' })
    )
  })

  it('re-links the recovered profile to the adopted customer', async () => {
    mocks.stripeCustomerList.mockResolvedValue({ data: [{ id: 'cus_existing' }] })

    await POST(createRequest())

    expect(mocks.updateVisitorProfileByAuthUserId).toHaveBeenCalledWith('visitor_123', {
      stripeCustomerId: 'cus_existing',
    })
  })

  it('creates a customer when the email is genuinely new to Stripe', async () => {
    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect(mocks.stripeCustomerCreate).toHaveBeenCalledTimes(1)
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_new' })
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
      expect.objectContaining({ customer: 'cus_linked' })
    )
  })
})
