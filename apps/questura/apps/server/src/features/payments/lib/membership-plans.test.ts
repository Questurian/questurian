import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  priceRetrieve: vi.fn(),
}))

vi.mock('./stripe', () => ({
  stripe: { prices: { retrieve: mocks.priceRetrieve } },
}))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    stripe: {
      priceId: 'price_monthly',
      monthlyPriceId: 'price_monthly',
      yearlyPriceId: 'price_yearly',
    },
  },
}))

import { getMembershipPlans, resetMembershipPlansCache } from './membership-plans'

function givenPrice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'price_monthly',
    unit_amount: 1299,
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1 },
    product: { name: 'Questurian Membership' },
    metadata: {},
    ...overrides,
  }
}

describe('getMembershipPlans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMembershipPlansCache()
  })

  it('reports the price and interval Stripe actually holds', async () => {
    mocks.priceRetrieve.mockResolvedValue(givenPrice())

    const [plan] = await getMembershipPlans()

    expect(plan).toMatchObject({
      amount: 1299,
      currency: 'usd',
      interval: 'month',
      productName: 'Questurian Membership',
      compareAtAmount: null,
    })
  })

  it('carries a compare-at price from metadata', async () => {
    mocks.priceRetrieve.mockResolvedValue(
      givenPrice({
        unit_amount: 7999,
        recurring: { interval: 'year', interval_count: 1 },
        metadata: { compare_at_amount: '15588' },
      })
    )

    const [plan] = await getMembershipPlans()

    expect(plan.compareAtAmount).toBe(15588)
    expect(plan.interval).toBe('year')
  })

  it('ignores a compare-at price that is not above the real price', async () => {
    // A "was" price at or below what is charged advertises a saving that does
    // not exist, which is worse than showing none.
    mocks.priceRetrieve.mockResolvedValue(
      givenPrice({ unit_amount: 7999, metadata: { compare_at_amount: '7999' } })
    )

    const [plan] = await getMembershipPlans()

    expect(plan.compareAtAmount).toBeNull()
  })

  it('ignores compare-at metadata that is not a number', async () => {
    mocks.priceRetrieve.mockResolvedValue(
      givenPrice({ metadata: { compare_at_amount: 'one hundred' } })
    )

    const [plan] = await getMembershipPlans()

    expect(plan.compareAtAmount).toBeNull()
  })

  it('omits a plan whose price is not recurring rather than selling it', async () => {
    mocks.priceRetrieve.mockResolvedValue(givenPrice({ recurring: null }))

    await expect(getMembershipPlans()).resolves.toEqual([])
  })

  it('omits a plan Stripe cannot resolve rather than inventing a number', async () => {
    mocks.priceRetrieve.mockRejectedValue(new Error('no such price'))

    await expect(getMembershipPlans()).resolves.toEqual([])
  })

  it('reuses a successful fetch within the TTL instead of hitting Stripe again', async () => {
    mocks.priceRetrieve.mockResolvedValue(givenPrice())

    const first = await getMembershipPlans()
    const second = await getMembershipPlans()

    expect(second).toEqual(first)
    expect(mocks.priceRetrieve).toHaveBeenCalledTimes(2)
  })
})
