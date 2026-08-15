import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findByCustomer: vi.fn(),
  findByAuthUser: vi.fn(),
  updateByAuthUser: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('@/features/visitor-auth/lib/visitor-profile', () => ({
  findVisitorProfileByStripeCustomerId: mocks.findByCustomer,
  findVisitorProfileByAuthUserId: mocks.findByAuthUser,
  updateVisitorProfileByAuthUserId: mocks.updateByAuthUser,
}))

vi.mock('@/shared/utils/logger', () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
    info: vi.fn(),
  },
}))

import { resolveProfileForStripeCustomer } from '@/payments/lib/subscription-profile'

describe('resolveProfileForStripeCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateByAuthUser.mockResolvedValue({ id: 10 })
  })

  it('resolves by customer id and leaves the linkage alone', async () => {
    mocks.findByCustomer.mockResolvedValue({ id: 10, stripeCustomerId: 'cus_1' })

    await expect(resolveProfileForStripeCustomer('cus_1', 'visitor_123')).resolves.toEqual({
      id: 10,
      stripeCustomerId: 'cus_1',
    })
    expect(mocks.findByAuthUser).not.toHaveBeenCalled()
    expect(mocks.updateByAuthUser).not.toHaveBeenCalled()
  })

  // The paid-but-unattributed case: nothing stored the customer on the profile,
  // so the customer id alone finds nobody.
  it('recovers the visitor from event metadata and restores the linkage', async () => {
    mocks.findByCustomer.mockResolvedValue(null)
    mocks.findByAuthUser.mockResolvedValue({ id: 10, stripeCustomerId: null })

    const profile = await resolveProfileForStripeCustomer('cus_1', 'visitor_123')

    expect(profile).toEqual({ id: 10, stripeCustomerId: 'cus_1' })
    expect(mocks.updateByAuthUser).toHaveBeenCalledWith('visitor_123', {
      stripeCustomerId: 'cus_1',
    })
  })

  // Repointing here would move a membership onto someone else's billing --
  // the same mix-up the ownership check at checkout exists to prevent.
  it('refuses to repoint a visitor already linked to another customer', async () => {
    mocks.findByCustomer.mockResolvedValue(null)
    mocks.findByAuthUser.mockResolvedValue({ id: 10, stripeCustomerId: 'cus_other' })

    await expect(resolveProfileForStripeCustomer('cus_1', 'visitor_123')).resolves.toBeNull()
    expect(mocks.updateByAuthUser).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalled()
  })

  it('reports rather than guesses when the event carries no visitor', async () => {
    mocks.findByCustomer.mockResolvedValue(null)

    await expect(resolveProfileForStripeCustomer('cus_1', null)).resolves.toBeNull()
    expect(mocks.findByAuthUser).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalled()
  })

  it('reports when neither the customer nor the metadata visitor exists', async () => {
    mocks.findByCustomer.mockResolvedValue(null)
    mocks.findByAuthUser.mockResolvedValue(null)

    await expect(resolveProfileForStripeCustomer('cus_1', 'visitor_gone')).resolves.toBeNull()
    expect(mocks.loggerError).toHaveBeenCalled()
  })

  // `stripe_customer_id` is unique, so a racing writer can claim it first. The
  // profile is still the right one to act on; only the repair failed.
  it('still returns the profile when restoring the linkage fails', async () => {
    mocks.findByCustomer.mockResolvedValue(null)
    mocks.findByAuthUser.mockResolvedValue({ id: 10, stripeCustomerId: null })
    mocks.updateByAuthUser.mockRejectedValue(new Error('duplicate key value'))

    await expect(resolveProfileForStripeCustomer('cus_1', 'visitor_123')).resolves.toEqual({
      id: 10,
      stripeCustomerId: 'cus_1',
    })
    expect(mocks.loggerError).toHaveBeenCalled()
  })
})
