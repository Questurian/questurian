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

import { findLiveSubscription, listBillableSubscriptions, syncStripeCustomerEmail } from '@/payments/lib/customer-linkage'

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
