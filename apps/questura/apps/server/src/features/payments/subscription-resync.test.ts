import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  list: vi.fn(),
  resolveProfile: vi.fn(),
  payloadUpdate: vi.fn(),
  loggerWarn: vi.fn(),
  sendMembershipConfirmationEmail: vi.fn(),
  sendSubscriptionCancelledEmail: vi.fn(),
  sendSubscriptionReactivatedEmail: vi.fn(),
}))

vi.mock('@/payments/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: mocks.retrieve,
      list: mocks.list,
    },
  },
}))

vi.mock('@/payments/lib/subscription-profile', () => ({
  resolveProfileForStripeCustomer: mocks.resolveProfile,
}))

vi.mock('@/emails', () => ({
  sendMembershipConfirmationEmail: mocks.sendMembershipConfirmationEmail,
  sendSubscriptionCancelledEmail: mocks.sendSubscriptionCancelledEmail,
  sendSubscriptionReactivatedEmail: mocks.sendSubscriptionReactivatedEmail,
}))

vi.mock('@/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.loggerWarn, error: vi.fn() },
}))

vi.mock('payload', () => ({
  getPayload: vi.fn().mockImplementation(async () => ({
    db: {},
    update: mocks.payloadUpdate,
  })),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

import { resyncSubscription } from '@/payments/lib/subscription-resync'

const HOUR = 60 * 60
const NOW = Math.floor(Date.now() / 1000)

function subscription(
  id: string,
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id,
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    created: NOW - HOUR,
    metadata: {},
    latest_invoice: null,
    items: {
      data: [{ id: `si_${id}`, current_period_start: NOW - HOUR, current_period_end: NOW + HOUR }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

/** A refunded subscription, as `charge.refunded` leaves it before resyncing. */
function revoked(id: string, overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return subscription(id, {
    status: 'canceled',
    metadata: { access_revoked: 'true', access_revoked_reason: 'refund' },
    ...overrides,
  } as Partial<Stripe.Subscription>)
}

function profile(stripeSubscriptionId: string | null) {
  return {
    id: 10,
    email: 'visitor@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    stripeSubscriptionId,
    subscriptionStatus: 'active',
    cancelAtPeriodEnd: false,
    paidThroughAt: new Date((NOW + HOUR) * 1000).toISOString(),
    dunningGraceUntil: null,
  }
}

/** Serve `retrieve` from a set of subscriptions keyed by id. */
function stripeHas(...subscriptions: Stripe.Subscription[]) {
  mocks.retrieve.mockImplementation(async (id: string) => {
    const found = subscriptions.find((candidate) => candidate.id === id)
    if (found) return found
    const error = new Error(`No such subscription: ${id}`) as Error & { code: string }
    error.code = 'resource_missing'
    throw error
  })
  mocks.list.mockResolvedValue({ data: subscriptions })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.payloadUpdate.mockResolvedValue({})
})

describe('resyncSubscription', () => {
  it('writes when the profile carries no subscription yet', async () => {
    stripeHas(subscription('sub_new'))
    mocks.resolveProfile.mockResolvedValue(profile(null))

    const result = await resyncSubscription('sub_new')

    expect(result.state?.subscriptionStatus).toBe('active')
    expect(mocks.payloadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        data: expect.objectContaining({ stripeSubscriptionId: 'sub_new' }),
      })
    )
  })

  it('writes the subscription the profile already points at', async () => {
    stripeHas(subscription('sub_1'))
    mocks.resolveProfile.mockResolvedValue(profile('sub_1'))

    await resyncSubscription('sub_1')

    expect(mocks.payloadUpdate).toHaveBeenCalledTimes(1)
    // The incumbent is this subscription, so ownership costs no extra API call.
    expect(mocks.list).not.toHaveBeenCalled()
  })

  // The goodwill-refund case: refunding an old subscription's last charge used
  // to stamp it over the membership the visitor is currently being billed for.
  it('refuses to write an old subscription over a live membership', async () => {
    const live = subscription('sub_c', { created: NOW - HOUR })
    stripeHas(revoked('sub_a', { created: NOW - 100 * HOUR }), live)
    mocks.resolveProfile.mockResolvedValue(profile('sub_c'))

    const result = await resyncSubscription('sub_a')

    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
    expect(result).toEqual({ profileId: 10, state: null, transitions: [] })
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  // The duplicate-checkout collapse refunds and cancels the extra it just made;
  // that refund must not undo the resync of the subscription that was kept.
  it('refuses to write a cancelled duplicate over the subscription that was kept', async () => {
    stripeHas(revoked('sub_b'), subscription('sub_a'))
    mocks.resolveProfile.mockResolvedValue(profile('sub_a'))

    await resyncSubscription('sub_b')

    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
  })

  it('lets a billing subscription take over from a dead one', async () => {
    stripeHas(subscription('sub_c'), subscription('sub_a', { status: 'canceled' }))
    mocks.resolveProfile.mockResolvedValue(profile('sub_a'))

    await resyncSubscription('sub_c')

    expect(mocks.payloadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeSubscriptionId: 'sub_c' }) })
    )
  })

  // An unconfirmed Checkout is not billing yet, so it must not displace the
  // subscription the visitor is actually paying on.
  it('refuses to let an incomplete subscription displace a live one', async () => {
    stripeHas(
      subscription('sub_new', { status: 'incomplete', created: NOW }),
      subscription('sub_live', { status: 'past_due' })
    )
    mocks.resolveProfile.mockResolvedValue(profile('sub_live'))

    await resyncSubscription('sub_new')

    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
  })

  it('lets the newest subscription win when none is billing', async () => {
    stripeHas(
      subscription('sub_new', { status: 'incomplete', created: NOW }),
      subscription('sub_old', { status: 'canceled', created: NOW - 100 * HOUR })
    )
    mocks.resolveProfile.mockResolvedValue(profile('sub_old'))

    await resyncSubscription('sub_new')

    expect(mocks.payloadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeSubscriptionId: 'sub_new' }) })
    )
  })

  it('refuses an older cancellation when none is billing', async () => {
    stripeHas(
      subscription('sub_old', { status: 'canceled', created: NOW - 100 * HOUR }),
      subscription('sub_new', { status: 'canceled', created: NOW })
    )
    mocks.resolveProfile.mockResolvedValue(profile('sub_new'))

    await resyncSubscription('sub_old')

    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
  })

  // A stale id Stripe has never heard of must not freeze the profile forever.
  it('writes when the profile points at a subscription Stripe no longer has', async () => {
    stripeHas(subscription('sub_new', { status: 'canceled' }))
    mocks.resolveProfile.mockResolvedValue(profile('sub_gone'))

    await resyncSubscription('sub_new')

    expect(mocks.payloadUpdate).toHaveBeenCalled()
  })

  // Deciding ownership on a failed lookup would guess; the webhook retries.
  it('propagates a transient failure while resolving the incumbent', async () => {
    mocks.retrieve.mockImplementation(async (id: string) => {
      if (id === 'sub_new') return subscription('sub_new', { status: 'canceled' })
      throw new Error('Stripe is down')
    })
    mocks.list.mockResolvedValue({ data: [] })
    mocks.resolveProfile.mockResolvedValue(profile('sub_a'))

    await expect(resyncSubscription('sub_new')).rejects.toThrow('Stripe is down')
    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
  })
})
