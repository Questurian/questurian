import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { headers } from 'next/headers'

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  invoiceRetrieve: vi.fn(),
  updateUserSubscription: vi.fn(),
  getStripeSubscriptionDetails: vi.fn(),
  getSubscriptionProductName: vi.fn(),
  sendMembershipConfirmationEmail: vi.fn(),
  sendSubscriptionCancelledEmail: vi.fn(),
  findVisitorProfileByStripeCustomerId: vi.fn(),
  payloadFind: vi.fn(),
  payloadCreate: vi.fn(),
}))

vi.mock('@/payments/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: mocks.constructEvent },
    invoices: { retrieve: mocks.invoiceRetrieve },
  },
}))

vi.mock('@/payments/lib/payment-service', () => ({
  updateUserSubscription: mocks.updateUserSubscription,
  getStripeSubscriptionDetails: mocks.getStripeSubscriptionDetails,
  mapStripeStatusToInternal: (status: string) =>
    status === 'active' || status === 'trialing'
      ? 'active'
      : ['canceled', 'cancelled', 'incomplete_expired'].includes(status)
        ? 'cancelled'
        : 'past_due',
}))

vi.mock('@/payments/lib/payment-helpers', () => ({
  convertStripeTimestamp: (timestamp: number | null | undefined) =>
    typeof timestamp === 'number' && timestamp > 0 ? new Date(timestamp * 1000) : null,
  getSubscriptionProductName: mocks.getSubscriptionProductName,
}))

vi.mock('@/emails', () => ({
  sendMembershipConfirmationEmail: mocks.sendMembershipConfirmationEmail,
  sendSubscriptionCancelledEmail: mocks.sendSubscriptionCancelledEmail,
}))

vi.mock('@/features/visitor-auth/lib/visitor-profile', () => ({
  findVisitorProfileByStripeCustomerId: mocks.findVisitorProfileByStripeCustomerId,
  splitDisplayName: (name: string | null | undefined) => {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
    return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
  },
}))

vi.mock('payload', () => ({
  getPayload: vi.fn().mockImplementation(async () => ({
    find: mocks.payloadFind,
    create: mocks.payloadCreate,
  })),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    stripe: { webhookSecret: 'whsec_test' },
    features: { endorselyAffiliates: false },
  },
}))

import { POST } from '@/app/api/payments/webhooks/stripe/route'

const FUTURE_TS = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
const PAST_TS = Math.floor(Date.now() / 1000) - 24 * 60 * 60

let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []

function createRequest() {
  return new Request('http://localhost:4000/api/payments/webhooks/stripe', {
    method: 'POST',
    body: '{}',
  }) as any
}

function givenEvent(type: string, object: Record<string, unknown>, extra: Partial<{ id: string; created: number }> = {}) {
  mocks.constructEvent.mockReturnValue({
    id: extra.id ?? 'evt_1',
    type,
    created: extra.created ?? Math.floor(Date.now() / 1000),
    data: { object },
  })
}

describe('Stripe webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ]
    vi.mocked(headers).mockResolvedValue(new Map([['stripe-signature', 't=1,v1=sig']]) as any)
    // First find = idempotency guard, second find = ordering guard
    mocks.payloadFind.mockResolvedValue({ totalDocs: 0, docs: [] })
    mocks.payloadCreate.mockResolvedValue({})
    mocks.updateUserSubscription.mockResolvedValue(true)
    mocks.getSubscriptionProductName.mockResolvedValue('Premium Membership')
    mocks.findVisitorProfileByStripeCustomerId.mockResolvedValue({
      id: 10,
      email: 'visitor@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
  })

  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore())
    consoleSpies = []
  })

  it('rejects requests without a stripe-signature header', async () => {
    vi.mocked(headers).mockResolvedValue(new Map() as any)

    const response = await POST(createRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'No signature' })
    expect(mocks.constructEvent).not.toHaveBeenCalled()
  })

  it('rejects requests whose signature does not verify', async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error('bad signature')
    })

    const response = await POST(createRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid signature' })
    expect(mocks.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('skips duplicate deliveries of an already-processed event', async () => {
    givenEvent('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1' })
    mocks.payloadFind.mockResolvedValueOnce({ totalDocs: 1, docs: [{}] })

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true })
    expect(mocks.updateUserSubscription).not.toHaveBeenCalled()
    expect(mocks.payloadCreate).not.toHaveBeenCalled()
  })

  it('skips stale subscription events when a newer one was already processed', async () => {
    givenEvent('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active' })
    mocks.payloadFind
      .mockResolvedValueOnce({ totalDocs: 0, docs: [] }) // idempotency guard
      .mockResolvedValueOnce({ totalDocs: 1, docs: [{}] }) // ordering guard

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({ received: true, stale: true })
    expect(mocks.updateUserSubscription).not.toHaveBeenCalled()
    // Recorded so retries of the stale event are also skipped
    expect(mocks.payloadCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventId: 'evt_1' }) }),
    )
  })

  it('activates the subscription and sends a confirmation email on checkout completion', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      customer_details: { name: 'Grace Hopper' },
    })
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      currentPeriodEnd: new Date(FUTURE_TS * 1000),
    })
    // Profile already has a name, so billing name must not overwrite it
    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({ received: true })
    expect(mocks.updateUserSubscription).toHaveBeenCalledWith('cus_1', {
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'active',
      subscriptionRenewsAt: new Date(FUTURE_TS * 1000).toISOString(),
    })
    expect(mocks.sendMembershipConfirmationEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'visitor@example.com', isRecurring: true }),
    )
    expect(mocks.payloadCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventId: 'evt_1' }) }),
    )
  })

  it('fills first/last name from the billing name only when the profile has none', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      customer_details: { name: 'Grace Brewster Hopper' },
    })
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      currentPeriodEnd: new Date(FUTURE_TS * 1000),
    })
    mocks.findVisitorProfileByStripeCustomerId.mockResolvedValue({
      id: 10,
      email: 'visitor@example.com',
      firstName: '',
      lastName: '',
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith(
      'cus_1',
      expect.objectContaining({ firstName: 'Grace', lastName: 'Brewster Hopper' }),
    )
  })

  it('records the Stripe billing email when it differs from the account email', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      customer_details: { email: 'grace@real-inbox.example' },
    })
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      currentPeriodEnd: new Date(FUTURE_TS * 1000),
    })
    mocks.findVisitorProfileByStripeCustomerId.mockResolvedValue({
      id: 10,
      email: 'typo@gmial.example',
      firstName: 'Grace',
      lastName: 'Hopper',
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith(
      'cus_1',
      expect.objectContaining({ billingEmail: 'grace@real-inbox.example' }),
    )
  })

  it('does not record a billing email that matches the account email', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      // Same address, different casing and padding: not a mismatch.
      customer_details: { email: '  Visitor@Example.com ' },
    })
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      currentPeriodEnd: new Date(FUTURE_TS * 1000),
    })
    mocks.findVisitorProfileByStripeCustomerId.mockResolvedValue({
      id: 10,
      email: 'visitor@example.com',
      firstName: 'Grace',
      lastName: 'Hopper',
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith(
      'cus_1',
      expect.not.objectContaining({ billingEmail: expect.anything() }),
    )
  })

  it('prefers the webhook period end over the Stripe API on subscription created', async () => {
    givenEvent('customer.subscription.created', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      current_period_end: FUTURE_TS,
    })
    // The confirmation-email path also fetches details; give the API a
    // different date to prove the renewal date came from the webhook payload.
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      currentPeriodEnd: new Date((FUTURE_TS + 999) * 1000),
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith('cus_1', {
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'active',
      subscriptionRenewsAt: new Date(FUTURE_TS * 1000).toISOString(),
    })
  })

  it('falls back to the Stripe API when the webhook payload has no period end', async () => {
    givenEvent('customer.subscription.created', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
    })
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      currentPeriodEnd: new Date(FUTURE_TS * 1000),
    })

    await POST(createRequest())

    expect(mocks.getStripeSubscriptionDetails).toHaveBeenCalledWith('sub_1')
    expect(mocks.updateUserSubscription).toHaveBeenCalledWith(
      'cus_1',
      expect.objectContaining({ subscriptionRenewsAt: new Date(FUTURE_TS * 1000).toISOString() }),
    )
  })

  it('sets membershipExpiration when the subscription is cancelled at period end', async () => {
    givenEvent('customer.subscription.updated', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: FUTURE_TS,
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith('cus_1', {
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'active',
      subscriptionRenewsAt: new Date(FUTURE_TS * 1000).toISOString(),
      cancelAtPeriodEnd: true,
      membershipExpiration: new Date(FUTURE_TS * 1000).toISOString(),
    })
  })

  it('clears membershipExpiration when the subscription is renewing normally', async () => {
    givenEvent('customer.subscription.updated', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: FUTURE_TS,
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith(
      'cus_1',
      expect.objectContaining({ cancelAtPeriodEnd: false, membershipExpiration: null }),
    )
  })

  it('honors the paid period when a deleted subscription has time remaining', async () => {
    givenEvent('customer.subscription.deleted', {
      id: 'sub_1',
      customer: 'cus_1',
      current_period_end: FUTURE_TS,
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith('cus_1', {
      subscriptionStatus: 'cancelled',
      membershipExpiration: new Date(FUTURE_TS * 1000).toISOString(),
      subscriptionRenewsAt: null,
      cancelAtPeriodEnd: false,
    })
    expect(mocks.sendSubscriptionCancelledEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ wasImmediate: false }),
    )
  })

  it('revokes immediately when a deleted subscription period already ended', async () => {
    givenEvent('customer.subscription.deleted', {
      id: 'sub_1',
      customer: 'cus_1',
      current_period_end: PAST_TS,
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith(
      'cus_1',
      expect.objectContaining({ subscriptionStatus: 'cancelled', membershipExpiration: null }),
    )
    expect(mocks.sendSubscriptionCancelledEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ wasImmediate: true }),
    )
  })

  it('updates the renewal date on subscription_cycle invoice payments', async () => {
    givenEvent('invoice.payment_succeeded', {
      id: 'in_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      billing_reason: 'subscription_cycle',
    })
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      currentPeriodEnd: new Date(FUTURE_TS * 1000),
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith('cus_1', {
      subscriptionRenewsAt: new Date(FUTURE_TS * 1000).toISOString(),
    })
    expect(mocks.sendMembershipConfirmationEmail).not.toHaveBeenCalled()
  })

  it('fetches a successful invoice when its webhook omits the subscription', async () => {
    givenEvent('invoice.payment_succeeded', {
      id: 'in_success_fallback',
      customer: 'cus_1',
      billing_reason: 'subscription_cycle',
    })
    mocks.invoiceRetrieve.mockResolvedValue({
      id: 'in_success_fallback',
      subscription: 'sub_from_api',
    })
    mocks.getStripeSubscriptionDetails.mockResolvedValue({
      currentPeriodEnd: new Date(FUTURE_TS * 1000),
    })

    await POST(createRequest())

    expect(mocks.invoiceRetrieve).toHaveBeenCalledWith('in_success_fallback')
    expect(mocks.getStripeSubscriptionDetails).toHaveBeenCalledWith('sub_from_api')
    expect(mocks.updateUserSubscription).toHaveBeenCalledWith('cus_1', {
      subscriptionRenewsAt: new Date(FUTURE_TS * 1000).toISOString(),
    })
  })

  it('marks the subscription past_due on failed invoice payments', async () => {
    givenEvent('invoice.payment_failed', {
      id: 'in_1',
      customer: 'cus_1',
      subscription: 'sub_1',
    })

    await POST(createRequest())

    expect(mocks.updateUserSubscription).toHaveBeenCalledWith('cus_1', {
      subscriptionStatus: 'past_due',
    })
  })

  it('fetches a failed invoice when its webhook omits the subscription', async () => {
    givenEvent('invoice.payment_failed', {
      id: 'in_failed_fallback',
      customer: 'cus_1',
    })
    mocks.invoiceRetrieve.mockResolvedValue({
      id: 'in_failed_fallback',
      subscription: 'sub_from_api',
    })

    await POST(createRequest())

    expect(mocks.invoiceRetrieve).toHaveBeenCalledWith('in_failed_fallback')
    expect(mocks.updateUserSubscription).toHaveBeenCalledWith('cus_1', {
      subscriptionStatus: 'past_due',
    })
  })

  it('acknowledges unhandled event types and records them for idempotency', async () => {
    givenEvent('customer.updated', { id: 'cus_1' })

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({ received: true })
    expect(mocks.updateUserSubscription).not.toHaveBeenCalled()
    expect(mocks.payloadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: 'evt_1', eventType: 'customer.updated' }),
      }),
    )
  })

  it('returns 500 and does not record the event when a handler fails', async () => {
    givenEvent('customer.subscription.deleted', {
      id: 'sub_1',
      customer: 'cus_1',
      current_period_end: FUTURE_TS,
    })
    mocks.updateUserSubscription.mockRejectedValue(new Error('db down'))

    const response = await POST(createRequest())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Processing failed' })
    // Not recorded, so Stripe's retry will be processed again
    expect(mocks.payloadCreate).not.toHaveBeenCalled()
  })
})
