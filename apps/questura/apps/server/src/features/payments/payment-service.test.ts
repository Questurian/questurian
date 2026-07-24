import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stripeSubscriptionUpdate: vi.fn(),
  stripeSubscriptionRetrieve: vi.fn(),
  sendSubscriptionCancelledEmail: vi.fn(),
  sendSubscriptionReactivatedEmail: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  findVisitorProfileByStripeCustomerId: vi.fn(),
  payloadUpdate: vi.fn(),
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

    await expect(cancelUserSubscription('user_1')).resolves.toEqual({
      success: false,
      message: 'Visitor profile not found',
    })
  })

  it('fails when there is no active subscription', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      subscriptionStatus: 'cancelled',
    })

    await expect(cancelUserSubscription('user_1')).resolves.toEqual({
      success: false,
      message: 'No active subscription found',
    })
    expect(mocks.stripeSubscriptionUpdate).not.toHaveBeenCalled()
  })

  it('cancels at period end, stores the expiration, and emails the visitor', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionUpdate.mockResolvedValue(subscriptionWithItemPeriodEnd(FUTURE_TS))

    const result = await cancelUserSubscription('user_1')

    expect(mocks.stripeSubscriptionUpdate).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: true,
    })
    expect(mocks.payloadUpdate).toHaveBeenCalledWith({
      collection: 'visitor-profiles',
      id: 10,
      data: {
        cancelAtPeriodEnd: true,
        membershipExpiration: new Date(FUTURE_TS * 1000).toISOString(),
      },
    })
    expect(mocks.sendSubscriptionCancelledEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'visitor@example.com', wasImmediate: false }),
    )
    expect(result.success).toBe(true)
    expect(result.membershipExpiresAt).toBe(new Date(FUTURE_TS * 1000).toISOString())
  })

  it('still succeeds when the cancellation email fails', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionUpdate.mockResolvedValue(subscriptionWithItemPeriodEnd(FUTURE_TS))
    mocks.sendSubscriptionCancelledEmail.mockRejectedValue(new Error('email down'))

    await expect(cancelUserSubscription('user_1')).resolves.toMatchObject({ success: true })
  })

  it('fails cleanly when Stripe rejects the cancellation', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)
    mocks.stripeSubscriptionUpdate.mockRejectedValue(new Error('stripe down'))

    await expect(cancelUserSubscription('user_1')).resolves.toEqual({
      success: false,
      message: 'Failed to cancel subscription',
    })
  })
})

describe('reactivateUserSubscription', () => {
  it('fails when the visitor profile does not exist', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(null)

    await expect(reactivateUserSubscription('user_1')).resolves.toEqual({
      success: false,
      message: 'Visitor profile not found',
    })
  })

  it('fails when the subscription no longer exists', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      stripeSubscriptionId: null,
    })

    const result = await reactivateUserSubscription('user_1')
    expect(result.success).toBe(false)
    expect(result.message).toContain('cannot be reactivated')
  })

  it('rejects reactivation when the subscription is already active and not cancelling', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(activeProfile)

    await expect(reactivateUserSubscription('user_1')).resolves.toEqual({
      success: false,
      message: 'Subscription is already active',
    })
    expect(mocks.stripeSubscriptionUpdate).not.toHaveBeenCalled()
  })

  it('clears the cancellation flag and restores the renewal date', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      cancelAtPeriodEnd: true,
    })
    mocks.stripeSubscriptionUpdate.mockResolvedValue(subscriptionWithItemPeriodEnd(FUTURE_TS))

    const result = await reactivateUserSubscription('user_1')

    expect(mocks.stripeSubscriptionUpdate).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: false,
    })
    expect(mocks.payloadUpdate).toHaveBeenCalledWith({
      collection: 'visitor-profiles',
      id: 10,
      data: {
        cancelAtPeriodEnd: false,
        membershipExpiration: null,
        subscriptionRenewsAt: new Date(FUTURE_TS * 1000).toISOString(),
      },
    })
    expect(mocks.sendSubscriptionReactivatedEmail).toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.renewsAt).toBe(new Date(FUTURE_TS * 1000).toISOString())
  })

  it('fails when Stripe returns no renewal date', async () => {
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      ...activeProfile,
      cancelAtPeriodEnd: true,
    })
    mocks.stripeSubscriptionUpdate.mockResolvedValue(subscriptionWithItemPeriodEnd(null))

    await expect(reactivateUserSubscription('user_1')).resolves.toEqual({
      success: false,
      message: 'Failed to get renewal date from Stripe',
    })
    expect(mocks.payloadUpdate).not.toHaveBeenCalled()
  })
})
