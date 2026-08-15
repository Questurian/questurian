import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stripeCustomerUpdate: vi.fn(),
}))

vi.mock('@/payments/lib/stripe', () => ({
  stripe: {
    customers: {
      update: mocks.stripeCustomerUpdate,
    },
  },
}))

import { syncStripeCustomerEmail } from '@/payments/lib/customer-linkage'

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
