import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stripeCustomerUpdate: vi.fn(),
  stripeSubscriptionList: vi.fn(),
}))

vi.mock('@/payments/lib/stripe', () => ({
  stripe: {
    customers: {
      update: mocks.stripeCustomerUpdate,
    },
    subscriptions: {
      list: mocks.stripeSubscriptionList,
    },
  },
}))

import {
  findLiveSubscription,
  listBillableSubscriptions,
  selectProfileSubscription,
  selectSubscriptionToKeep,
  syncStripeCustomerEmail,
} from '@/payments/lib/customer-linkage'

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null

describe('syncStripeCustomerEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.stripeCustomerUpdate.mockResolvedValue({ id: 'cus_123' })
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
  })

  it('writes the new address onto the linked customer', async () => {
    await expect(syncStripeCustomerEmail('cus_123', 'new@example.com')).resolves.toBe(true)

    expect(mocks.stripeCustomerUpdate).toHaveBeenCalledWith('cus_123', {
      email: 'new@example.com',
    })
  })

  it('does nothing for a visitor who has never reached Stripe', async () => {
    await expect(syncStripeCustomerEmail(null, 'new@example.com')).resolves.toBe(false)
    await expect(syncStripeCustomerEmail(undefined, 'new@example.com')).resolves.toBe(false)

    expect(mocks.stripeCustomerUpdate).not.toHaveBeenCalled()
  })

  it('does nothing without an address to write', async () => {
    await expect(syncStripeCustomerEmail('cus_123', null)).resolves.toBe(false)

    expect(mocks.stripeCustomerUpdate).not.toHaveBeenCalled()
  })

  // This runs inside email verification: a Stripe outage must not cost someone
  // their verified address.
  it('survives a Stripe failure instead of failing verification', async () => {
    mocks.stripeCustomerUpdate.mockRejectedValue(new Error('stripe is down'))

    await expect(syncStripeCustomerEmail('cus_123', 'new@example.com')).resolves.toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})

describe('findLiveSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stripeSubscriptionList.mockResolvedValue({ data: [] })
  })

  it('returns a past_due subscription that local status would have ignored', async () => {
    mocks.stripeSubscriptionList.mockResolvedValue({
      data: [{ id: 'sub_dunning', status: 'past_due' }],
    })

    await expect(findLiveSubscription('cus_123')).resolves.toEqual(
      expect.objectContaining({ id: 'sub_dunning', status: 'past_due' })
    )
  })

  it('ignores canceled and incomplete subscriptions so the visitor can pay again', async () => {
    mocks.stripeSubscriptionList.mockResolvedValue({
      data: [
        { id: 'sub_old', status: 'canceled' },
        { id: 'sub_open', status: 'incomplete' },
      ],
    })

    await expect(findLiveSubscription('cus_123')).resolves.toBeNull()
  })

  it('asks Stripe for every status, not only active', async () => {
    await findLiveSubscription('cus_123')

    expect(mocks.stripeSubscriptionList).toHaveBeenCalledWith({
      customer: 'cus_123',
      status: 'all',
      limit: 100,
    })
  })
})

describe('listBillableSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stripeSubscriptionList.mockResolvedValue({ data: [] })
  })

  it('includes incomplete subscriptions that checkout completion must collapse', async () => {
    mocks.stripeSubscriptionList.mockResolvedValue({
      data: [
        { id: 'sub_old', status: 'canceled' },
        { id: 'sub_open', status: 'incomplete' },
        { id: 'sub_live', status: 'active' },
      ],
    })

    await expect(listBillableSubscriptions('cus_123')).resolves.toEqual([
      expect.objectContaining({ id: 'sub_open', status: 'incomplete' }),
      expect.objectContaining({ id: 'sub_live', status: 'active' }),
    ])
  })
})

describe('selectSubscriptionToKeep', () => {
  const subscription = (
    id: string,
    status: string,
    created: number,
  ) => ({ id, status, created }) as never

  it('returns null when nothing is billable', () => {
    expect(selectSubscriptionToKeep([])).toBeNull()
  })

  it('keeps the subscription that paid over an older abandoned 3DS attempt', () => {
    const kept = selectSubscriptionToKeep([
      subscription('sub_abandoned', 'incomplete', 100),
      subscription('sub_paid', 'active', 200),
    ])

    expect(kept).toEqual(expect.objectContaining({ id: 'sub_paid' }))
  })

  it('keeps the newer when both subscriptions actually collected', () => {
    const kept = selectSubscriptionToKeep([
      subscription('sub_old', 'active', 100),
      subscription('sub_new', 'active', 200),
    ])

    expect(kept).toEqual(expect.objectContaining({ id: 'sub_new' }))
  })

  it('prefers a subscription Stripe is still retrying over one that never confirmed', () => {
    const kept = selectSubscriptionToKeep([
      subscription('sub_never_confirmed', 'incomplete', 100),
      subscription('sub_retrying', 'past_due', 200),
    ])

    expect(kept).toEqual(expect.objectContaining({ id: 'sub_retrying' }))
  })

  it('falls back to newer when every candidate is equally unpaid', () => {
    const kept = selectSubscriptionToKeep([
      subscription('sub_newer', 'incomplete', 200),
      subscription('sub_older', 'incomplete', 100),
    ])

    expect(kept).toEqual(expect.objectContaining({ id: 'sub_newer' }))
  })
})

describe('selectProfileSubscription', () => {
  const subscription = (
    id: string,
    status: string,
    created: number,
  ) => ({ id, status, created }) as never

  it('returns null for a customer with no subscriptions', () => {
    expect(selectProfileSubscription([])).toBeNull()
  })

  // The reconciler bug: an abandoned 3DS attempt sits `incomplete` for ~23
  // hours, so it is the newest thing on the customer while the membership that
  // is actually billing runs on. Mirroring the attempt onto the profile writes
  // `past_due` over remaining paid time and points the cancel button at a dead
  // subscription.
  it('keeps the billing subscription over a newer abandoned attempt', () => {
    const selected = selectProfileSubscription([
      subscription('sub_abandoned', 'incomplete', 200),
      subscription('sub_paid', 'active', 100),
    ])

    expect(selected).toEqual(expect.objectContaining({ id: 'sub_paid' }))
  })

  it('keeps a subscription Stripe is still retrying over a newer dead one', () => {
    const selected = selectProfileSubscription([
      subscription('sub_dead', 'canceled', 300),
      subscription('sub_retrying', 'past_due', 100),
    ])

    expect(selected).toEqual(expect.objectContaining({ id: 'sub_retrying' }))
  })

  it('keeps the newest when several are live', () => {
    const selected = selectProfileSubscription([
      subscription('sub_old', 'active', 100),
      subscription('sub_new', 'active', 200),
    ])

    expect(selected).toEqual(expect.objectContaining({ id: 'sub_new' }))
  })

  // With nothing billing, the newest closed record is the profile's final
  // state, so an older cancellation cannot overwrite a newer one.
  it('falls back to the newest when nothing is live', () => {
    const selected = selectProfileSubscription([
      subscription('sub_older', 'canceled', 100),
      subscription('sub_newer', 'incomplete_expired', 200),
    ])

    expect(selected).toEqual(expect.objectContaining({ id: 'sub_newer' }))
  })
})
