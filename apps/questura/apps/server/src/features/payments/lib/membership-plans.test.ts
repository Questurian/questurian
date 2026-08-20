import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MEMBERSHIP_CATALOG } from './membership-catalog'

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

import { getMembershipPlans } from './membership-plans'

function givenMonthly(overrides: Record<string, unknown> = {}) {
  return {
    id: 'price_monthly',
    unit_amount: MEMBERSHIP_CATALOG.monthly.amount,
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1 },
    product: { name: 'Questurian Membership' },
    metadata: {},
    ...overrides,
  }
}

function givenYearly(overrides: Record<string, unknown> = {}) {
  return {
    id: 'price_yearly',
    unit_amount: MEMBERSHIP_CATALOG.yearly.amount,
    currency: 'usd',
    recurring: { interval: 'year', interval_count: 1 },
    product: { name: 'Questurian Membership' },
    metadata: {},
    ...overrides,
  }
}

function stubStripePrices(monthly: Record<string, unknown>, yearly: Record<string, unknown> | null) {
  mocks.priceRetrieve.mockImplementation(async (id: string) => {
    if (id === 'price_yearly') {
      if (!yearly) throw new Error('no such price')
      return yearly
    }
    return monthly
  })
}

describe('getMembershipPlans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('advertises the catalog even when Stripe charges a cheaper test amount', async () => {
    stubStripePrices(givenMonthly({ unit_amount: 50 }), givenYearly({ unit_amount: 50 }))

    const plans = await getMembershipPlans()

    expect(plans).toEqual([
      expect.objectContaining({
        id: 'monthly',
        amount: 1299,
        currency: 'usd',
        interval: 'month',
      }),
      expect.objectContaining({
        id: 'yearly',
        amount: 7999,
        currency: 'usd',
        interval: 'year',
      }),
    ])
  })

  it('advertises the catalog when Stripe already matches it', async () => {
    stubStripePrices(givenMonthly(), givenYearly())

    const [monthly] = await getMembershipPlans()

    expect(monthly).toMatchObject({
      amount: 1299,
      currency: 'usd',
      interval: 'month',
      productName: 'Questurian Membership',
      compareAtAmount: null,
    })
  })

  it('omits a plan Stripe would charge more than the catalog', async () => {
    stubStripePrices(givenMonthly({ unit_amount: 2000 }), givenYearly())

    const plans = await getMembershipPlans()

    expect(plans.map((plan) => plan.id)).toEqual(['yearly'])
  })

  it('omits a yearly price that actually bills monthly', async () => {
    stubStripePrices(
      givenMonthly(),
      givenYearly({ recurring: { interval: 'month', interval_count: 1 } }),
    )

    const plans = await getMembershipPlans()

    expect(plans.map((plan) => plan.id)).toEqual(['monthly'])
  })

  it('carries a compare-at price from metadata', async () => {
    stubStripePrices(
      givenMonthly(),
      givenYearly({ metadata: { compare_at_amount: '15588' } }),
    )

    const yearly = (await getMembershipPlans()).find((plan) => plan.id === 'yearly')

    expect(yearly?.compareAtAmount).toBe(15588)
    expect(yearly?.interval).toBe('year')
  })

  it('ignores a compare-at price that is not above the catalog', async () => {
    stubStripePrices(
      givenMonthly({ metadata: { compare_at_amount: '1299' } }),
      givenYearly(),
    )

    const monthly = (await getMembershipPlans()).find((plan) => plan.id === 'monthly')

    expect(monthly?.compareAtAmount).toBeNull()
  })

  it('ignores compare-at metadata that is not a number', async () => {
    stubStripePrices(
      givenMonthly({ metadata: { compare_at_amount: 'one hundred' } }),
      givenYearly(),
    )

    const monthly = (await getMembershipPlans()).find((plan) => plan.id === 'monthly')

    expect(monthly?.compareAtAmount).toBeNull()
  })

  it('omits a plan whose price is not recurring rather than selling it', async () => {
    stubStripePrices(givenMonthly({ recurring: null }), null)

    await expect(getMembershipPlans()).resolves.toEqual([])
  })

  it('omits a plan Stripe cannot resolve rather than inventing a number', async () => {
    mocks.priceRetrieve.mockRejectedValue(new Error('no such price'))

    await expect(getMembershipPlans()).resolves.toEqual([])
  })

  it('hits Stripe on every call rather than serving a per-process cache', async () => {
    // A per-process cache was here and was removed on purpose (e8a69d1d): it
    // disagreed across instances, and checkout never used it, so it protected
    // the display path only. Re-adding it has been proposed since on the
    // grounds that two `prices.retrieve` per pricing-page view share Stripe's
    // rate budget with webhook processing. That budget is already defended the
    // way that commit chose -- a per-visitor limit alongside the per-IP one --
    // and nothing has been observed throttling a webhook. Reverse this only
    // with a measurement, not an argument.
    stubStripePrices(givenMonthly(), givenYearly())

    const first = await getMembershipPlans()
    const second = await getMembershipPlans()

    expect(second).toEqual(first)
    expect(mocks.priceRetrieve).toHaveBeenCalledTimes(4)
  })
})
