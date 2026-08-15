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
  resyncSubscription: vi.fn(),
}))

const eventLock = vi.hoisted(() => ({ tail: Promise.resolve() as Promise<unknown> }))

vi.mock('@/shared/utils/advisory-lock', () => ({
  withAdvisoryLock: vi.fn(
    (_payload: unknown, _key: string, work: () => Promise<unknown>) => {
      const result = eventLock.tail.then(work, work)
      eventLock.tail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  ),
}))

// Subscription state is written by resync alone (ADR-0008); these tests assert
// that each event reaches it, and subscription-state.test.ts covers what it
// then derives, against payloads Stripe actually sent.
vi.mock('@/payments/lib/subscription-resync', () => ({
  resyncSubscription: mocks.resyncSubscription,
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

vi.mock('@/payments/lib/subscription-profile', () => ({
  resolveProfileForStripeCustomer: mocks.findVisitorProfileByStripeCustomerId,
}))

vi.mock('@/features/visitor-auth/lib/visitor-profile', () => ({
  findVisitorProfileByStripeCustomerId: mocks.findVisitorProfileByStripeCustomerId,
  findVisitorProfileByAuthUserId: vi.fn(),
  updateVisitorProfileByAuthUserId: vi.fn(),
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
    eventLock.tail = Promise.resolve()
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
    mocks.resyncSubscription.mockResolvedValue({ profileId: 10, state: null, transitions: [] })
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
    expect(mocks.resyncSubscription).not.toHaveBeenCalled()
  })

  it('skips duplicate deliveries of an already-processed event', async () => {
    givenEvent('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1' })
    mocks.payloadFind.mockResolvedValueOnce({ totalDocs: 1, docs: [{}] })

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true })
    expect(mocks.resyncSubscription).not.toHaveBeenCalled()
    expect(mocks.payloadCreate).not.toHaveBeenCalled()
  })

  it('serializes concurrent deliveries before checking whether the event was processed', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
    })
    let processed = false
    mocks.payloadFind.mockImplementation(async () => ({
      totalDocs: processed ? 1 : 0,
      docs: processed ? [{}] : [],
    }))
    mocks.payloadCreate.mockImplementation(async () => {
      processed = true
      return {}
    })

    const responses = await Promise.all([POST(createRequest()), POST(createRequest())])
    const bodies = await Promise.all(responses.map((response) => response.json()))

    expect(bodies).toContainEqual({ received: true })
    expect(bodies).toContainEqual({ received: true, duplicate: true })
    expect(mocks.resyncSubscription).toHaveBeenCalledTimes(1)
    expect(mocks.payloadCreate).toHaveBeenCalledTimes(1)
  })

  it('skips stale subscription events when a newer one was already processed', async () => {
    givenEvent('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active' })
    mocks.payloadFind
      .mockResolvedValueOnce({ totalDocs: 0, docs: [] }) // idempotency guard
      .mockResolvedValueOnce({ totalDocs: 1, docs: [{}] }) // ordering guard

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({ received: true, stale: true })
    expect(mocks.resyncSubscription).not.toHaveBeenCalled()
    // Recorded so retries of the stale event are also skipped
    expect(mocks.payloadCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventId: 'evt_1' }) }),
    )
  })

  it('resyncs the paid subscription on checkout completion instead of stamping active', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      metadata: { visitorAuthUserId: 'visitor_123' },
    })

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({ received: true })
    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
    // Entitlement dates come from resync. Writing `active` here granted no
    // access (paidThroughAt was still empty) and blocked a retry checkout.
    expect(mocks.updateUserSubscription).not.toHaveBeenCalled()
    expect(mocks.sendMembershipConfirmationEmail).not.toHaveBeenCalled()
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

    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
    expect(mocks.updateUserSubscription).toHaveBeenCalledWith(
      'cus_1',
      { firstName: 'Grace', lastName: 'Brewster Hopper' },
      null,
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

    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
    expect(mocks.updateUserSubscription).toHaveBeenCalledWith(
      'cus_1',
      { billingEmail: 'grace@real-inbox.example' },
      null,
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

    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
    expect(mocks.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('resyncs from Stripe on subscription created rather than trusting the payload', async () => {
    // The payload carries a full subscription object and is deliberately
    // ignored: it renders at the endpoint's API version, not the SDK's.
    givenEvent('customer.subscription.created', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      current_period_end: FUTURE_TS,
    })

    await POST(createRequest())

    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
  })

  it('resyncs on subscription updated', async () => {
    givenEvent('customer.subscription.updated', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: true,
    })

    await POST(createRequest())

    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
  })

  it('resyncs on subscription deleted instead of reading a root period end', async () => {
    // The old handler read `current_period_end` off the subscription root,
    // which the SDK's API version does not populate.
    givenEvent('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1' })

    await POST(createRequest())

    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
  })

  it('resyncs on successful invoice payments', async () => {
    givenEvent('invoice.payment_succeeded', {
      id: 'in_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      billing_reason: 'subscription_cycle',
    })

    await POST(createRequest())

    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
  })

  it('fetches a successful invoice when its webhook omits the subscription', async () => {
    givenEvent('invoice.payment_succeeded', { id: 'in_1', customer: 'cus_1' })
    mocks.invoiceRetrieve.mockResolvedValue({
      id: 'in_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
    })

    await POST(createRequest())

    expect(mocks.invoiceRetrieve).toHaveBeenCalledWith('in_1')
    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
  })

  it('resyncs on failed invoice payments rather than writing past_due itself', async () => {
    // Writing past_due here was the P0 bug: it revoked a paying visitor's
    // access on the first decline. The subscription object now decides.
    givenEvent('invoice.payment_failed', {
      id: 'in_1',
      customer: 'cus_1',
      subscription: 'sub_1',
    })

    await POST(createRequest())

    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
    expect(mocks.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('fetches a failed invoice when its webhook omits the subscription', async () => {
    givenEvent('invoice.payment_failed', { id: 'in_1', customer: 'cus_1' })
    mocks.invoiceRetrieve.mockResolvedValue({ id: 'in_1', subscription: 'sub_1' })

    await POST(createRequest())

    expect(mocks.invoiceRetrieve).toHaveBeenCalledWith('in_1')
    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
  })

  it('ignores an invoice with no subscription at all', async () => {
    givenEvent('invoice.payment_succeeded', { id: 'in_1', customer: 'cus_1' })
    mocks.invoiceRetrieve.mockResolvedValue({ id: 'in_1' })

    await POST(createRequest())

    expect(mocks.resyncSubscription).not.toHaveBeenCalled()
  })

  it('acknowledges unhandled event types and records them for idempotency', async () => {
    givenEvent('customer.updated', { id: 'cus_1' })

    const response = await POST(createRequest())

    await expect(response.json()).resolves.toEqual({ received: true })
    expect(mocks.resyncSubscription).not.toHaveBeenCalled()
    expect(mocks.payloadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: 'evt_1', eventType: 'customer.updated' }),
      }),
    )
  })

  it('returns 500 and does not record the event when a handler fails', async () => {
    givenEvent('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1' })
    mocks.resyncSubscription.mockRejectedValue(new Error('db down'))

    const response = await POST(createRequest())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Processing failed' })
    // Not recorded, so Stripe's retry will be processed again
    expect(mocks.payloadCreate).not.toHaveBeenCalled()
  })

  it('returns 500 when the processed-event record cannot be stored', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
    })
    mocks.payloadCreate.mockRejectedValue(new Error('event store unavailable'))

    const response = await POST(createRequest())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Processing failed' })
  })

  it('returns 500 when checkout cannot resync, so Stripe retries', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
    })
    mocks.resyncSubscription.mockResolvedValue({ profileId: null, state: null, transitions: [] })

    const response = await POST(createRequest())

    expect(response.status).toBe(500)
    expect(mocks.payloadCreate).not.toHaveBeenCalled()
  })

  it('returns 500 when checkout extras cannot be stored', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      customer_details: { email: 'grace@real-inbox.example' },
    })
    mocks.updateUserSubscription.mockResolvedValue(false)

    const response = await POST(createRequest())

    expect(response.status).toBe(500)
    expect(mocks.payloadCreate).not.toHaveBeenCalled()
  })

  it('returns 500 when a paid checkout session has no subscription id', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
    })

    const response = await POST(createRequest())

    expect(response.status).toBe(500)
    expect(mocks.resyncSubscription).not.toHaveBeenCalled()
    expect(mocks.payloadCreate).not.toHaveBeenCalled()
  })
})
