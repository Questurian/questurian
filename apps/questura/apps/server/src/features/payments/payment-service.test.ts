import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stripeSubscriptionUpdate: vi.fn(),
  stripeSubscriptionRetrieve: vi.fn(),
  sendSubscriptionCancelledEmail: vi.fn(),
  sendSubscriptionReactivatedEmail: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  findVisitorProfileByStripeCustomerId: vi.fn(),
  payloadUpdate: vi.fn(),
  resyncSubscription: vi.fn(),
}))

// cancel/reactivate call Stripe then hand the write to resync, so these tests
// assert delegation rather than re-checking what resync derives.
vi.mock('@/payments/lib/subscription-resync', () => ({
  resyncSubscription: mocks.resyncSubscription,
}))

vi.mock('@/payments/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      update: mocks.stripeSubscriptionUpdate,
      retrieve: mocks.stripeSubscriptionRetrieve,
    },
  },
}))

vi.mock('@/emails', () => ({
  sendSubscriptionCancelledEmail: mocks.sendSubscriptionCancelledEmail,
  sendSubscriptionReactivatedEmail: mocks.sendSubscriptionReactivatedEmail,
}))

vi.mock('@/features/visitor-auth/lib/visitor-profile', () => ({
  findVisitorProfileByAuthUserId: mocks.findVisitorProfileByAuthUserId,
  findVisitorProfileByStripeCustomerId: mocks.findVisitorProfileByStripeCustomerId,
}))

vi.mock('payload', () => ({
  getPayload: vi.fn().mockImplementation(async () => ({
    update: mocks.payloadUpdate,
  })),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

import {
  cancelUserSubscription,
  getCurrentPeriodEnd,
  mapStripeStatusToInternal,
  reactivateUserSubscription,
  updateUserSubscription,
} from '@/payments/lib/payment-service'
import type { StripeSubscriptionExpanded } from '@/payments/types'

const FUTURE_TS = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

function subscriptionWithItemPeriodEnd(periodEnd: number | null): StripeSubscriptionExpanded {
  return {
    items: { data: periodEnd === null ? [] : [{ id: 'si_1', current_period_end: periodEnd }] },
  } as unknown as StripeSubscriptionExpanded
}

const activeProfile = {
  id: 10,
  email: 'visitor@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  stripeSubscriptionId: 'sub_1',
  subscriptionStatus: 'active',
  cancelAtPeriodEnd: false,
}

let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []

beforeEach(() => {
  vi.clearAllMocks()
  consoleSpies = [
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
  ]
  mocks.payloadUpdate.mockResolvedValue({})
  // clearAllMocks keeps implementations, so a rejection set by one test would
  // otherwise leak into the next.
  mocks.stripeSubscriptionUpdate.mockReset()
  mocks.stripeSubscriptionUpdate.mockResolvedValue({ id: 'sub_1' })
  mocks.resyncSubscription.mockReset()
  mocks.resyncSubscription.mockResolvedValue({ profileId: 10, state: null, transitions: [] })
  // getSubscriptionProductName path (expand items.data.price.product)
  mocks.stripeSubscriptionRetrieve.mockResolvedValue({
    items: { data: [{ price: { product: { name: 'Premium Membership' } } }] },
  })
})

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore())
  consoleSpies = []
})

describe('mapStripeStatusToInternal', () => {
  it.each([
    ['active', 'active'],
    ['trialing', 'active'],
    ['past_due', 'past_due'],
    ['unpaid', 'past_due'],
    ['incomplete', 'past_due'],
    ['canceled', 'cancelled'],
    ['cancelled', 'cancelled'],
    ['incomplete_expired', 'cancelled'],
    ['some_future_status', 'past_due'],
  ])('maps %s to %s', (stripeStatus, internal) => {
    expect(mapStripeStatusToInternal(stripeStatus)).toBe(internal)
  })
})

describe('getCurrentPeriodEnd', () => {
  it('extracts the period end from the first subscription item', () => {
    const result = getCurrentPeriodEnd(subscriptionWithItemPeriodEnd(FUTURE_TS))
    expect(result).toEqual(new Date(FUTURE_TS * 1000))
  })

  it('returns null when the subscription has no items', () => {
    expect(getCurrentPeriodEnd(subscriptionWithItemPeriodEnd(null))).toBeNull()
    expect(getCurrentPeriodEnd({} as StripeSubscriptionExpanded)).toBeNull()
  })

  it('returns null for a non-positive timestamp', () => {
    expect(getCurrentPeriodEnd(subscriptionWithItemPeriodEnd(0))).toBeNull()
  })
})

describe('updateUserSubscription', () => {
  it('returns false when no profile matches the Stripe customer', async () => {
    mocks.findVisitorProfileByStripeCustomerId.mockResolvedValue(null)

    await expect(updateUserSubscription('cus_missing', { subscriptionStatus: 'active' })).resolves.toBe(false)
    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
  })

  it('updates the matched profile and returns true', async () => {
    mocks.findVisitorProfileByStripeCustomerId.mockResolvedValue(activeProfile)

    await expect(updateUserSubscription('cus_1', { subscriptionStatus: 'past_due' })).resolves.toBe(true)
    expect(mocks.payloadUpdate).toHaveBeenCalledWith({
      collection: 'visitor-profiles',
      id: 10,
      data: { subscriptionStatus: 'past_due' },
    })
  })

  it('returns false when the update throws', async () => {
    mocks.findVisitorProfileByStripeCustomerId.mockResolvedValue(activeProfile)
    mocks.payloadUpdate.mockRejectedValue(new Error('db down'))

    await expect(updateUserSubscription('cus_1', { subscriptionStatus: 'active' })).resolves.toBe(false)
  })
})

describe('cancelUserSubscription', () => {
  it('fails when the visitor profile does not exist', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(null)

    await expect(cancelUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'Visitor profile not found',
    })
    expect(mocks.stripeSubscriptionUpdate).not.toHaveBeenCalled()
  })

  it('fails when the profile has no subscription at all', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      stripeSubscriptionId: null,
    })

    await expect(cancelUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'No subscription found',
    })
  })

  it('lets a visitor in dunning cancel, which the old active-only guard refused', async () => {
    // Someone being retried is the person most likely to want out; requiring a
    // local `active` status turned them away (ADR-0008).
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      subscriptionStatus: 'past_due',
    })
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'past_due',
      cancel_at_period_end: false,
    })
    mocks.resyncSubscription.mockResolvedValue({
      profileId: 10,
      state: { paidThroughAt: new Date(FUTURE_TS * 1000).toISOString() },
      transitions: [],
    })

    const result = await cancelUserSubscription('auth_1')

    expect(result.success).toBe(true)
    expect(mocks.stripeSubscriptionUpdate).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: true,
    })
  })

  it('refuses when Stripe reports the subscription already gone', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'canceled',
      cancel_at_period_end: false,
    })

    await expect(cancelUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'This subscription can no longer be cancelled.',
    })
    expect(mocks.stripeSubscriptionUpdate).not.toHaveBeenCalled()
  })

  it('refuses a second cancellation of an already-cancelling subscription', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: true,
    })

    await expect(cancelUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'Subscription is already scheduled to cancel.',
    })
    expect(mocks.stripeSubscriptionUpdate).not.toHaveBeenCalled()
  })

  it('delegates the write to resync and reports the date resync derived', async () => {
    const endsAt = new Date(FUTURE_TS * 1000).toISOString()
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: false,
    })
    mocks.resyncSubscription.mockResolvedValue({
      profileId: 10,
      state: { paidThroughAt: endsAt },
      transitions: [],
    })

    const result = await cancelUserSubscription('auth_1')

    expect(result.success).toBe(true)
    expect(result.membershipExpiresAt).toBe(endsAt)
    expect(mocks.resyncSubscription).toHaveBeenCalledWith('sub_1')
    // The endpoint no longer writes state or emails directly; resync owns both.
    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
    expect(mocks.sendSubscriptionCancelledEmail).not.toHaveBeenCalled()
  })

  it('fails cleanly when Stripe rejects the cancellation', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: false,
    })
    mocks.stripeSubscriptionUpdate.mockRejectedValue(new Error('stripe down'))

    await expect(cancelUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'Failed to cancel subscription',
    })
  })
})

describe('reactivateUserSubscription', () => {
  it('fails when the visitor profile does not exist', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(null)

    await expect(reactivateUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'Visitor profile not found',
    })
  })

  it('fails when the subscription no longer exists', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      stripeSubscriptionId: null,
    })

    await expect(reactivateUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message:
        'Subscription has expired and cannot be reactivated. Please create a new subscription.',
    })
  })

  it('rejects reactivation when the subscription is already active and not cancelling', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: false,
    })

    await expect(reactivateUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'Subscription is already active',
    })
    expect(mocks.stripeSubscriptionUpdate).not.toHaveBeenCalled()
  })

  it('refuses to reactivate a subscription Stripe has already ended', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'canceled',
      cancel_at_period_end: false,
    })

    await expect(reactivateUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'Subscription cannot be reactivated. Please create a new subscription.',
    })
  })

  it('clears the cancellation flag and reports the date resync derived', async () => {
    const renewsAt = new Date(FUTURE_TS * 1000).toISOString()
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      cancelAtPeriodEnd: true,
    })
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: true,
    })
    mocks.resyncSubscription.mockResolvedValue({
      profileId: 10,
      state: { paidThroughAt: renewsAt },
      transitions: [],
    })

    const result = await reactivateUserSubscription('auth_1')

    expect(result.success).toBe(true)
    expect(result.renewsAt).toBe(renewsAt)
    expect(mocks.stripeSubscriptionUpdate).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: false,
    })
    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
    expect(mocks.sendSubscriptionReactivatedEmail).not.toHaveBeenCalled()
  })

  it('fails cleanly when Stripe rejects the reactivation', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      cancelAtPeriodEnd: true,
    })
    mocks.stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: true,
    })
    mocks.stripeSubscriptionUpdate.mockRejectedValue(new Error('stripe down'))

    await expect(reactivateUserSubscription('auth_1')).resolves.toEqual({
      success: false,
      message: 'Failed to reactivate subscription',
    })
  })
})
