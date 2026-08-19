import { MEMBERSHIP_CATALOG, type CatalogPlanId } from '@/payments/lib/membership-catalog'

/**
 * A Stripe price that passes catalog validation.
 *
 * Checkout no longer charges the raw `STRIPE_PRICE_ID_*` from host env — it
 * resolves the price through `getPurchasablePlan`, which retrieves it from
 * Stripe and refuses anything whose interval, currency or amount disagrees with
 * `MEMBERSHIP_CATALOG`. So any test that expects a checkout session to be
 * created has to stub a price Stripe would return, not just configure an id.
 */
export function catalogPrice(
  plan: CatalogPlanId,
  priceId: string,
  /** Override a single field to build the price the catalog should reject. */
  overrides: Record<string, unknown> = {}
) {
  const catalog = MEMBERSHIP_CATALOG[plan]

  return {
    id: priceId,
    unit_amount: catalog.amount,
    currency: catalog.currency,
    recurring: { interval: catalog.interval, interval_count: 1 },
    product: { name: 'Questurian Membership' },
    metadata: {},
    ...overrides,
  }
}

/**
 * Stub for `stripe.prices.retrieve` covering both plans the checkout route
 * tests configure. Which plan an id maps to is decided by the id itself, so a
 * test can keep asserting on the id it set in the `APP_CONFIG` mock.
 */
export function catalogPriceRetrieve(
  ids: { monthly: string; yearly: string } = {
    monthly: 'price_123',
    yearly: 'price_yearly_123',
  }
) {
  return async (priceId: string) => {
    if (priceId === ids.yearly) return catalogPrice('yearly', priceId)
    if (priceId === ids.monthly) return catalogPrice('monthly', priceId)
    // Same shape as the real client: an unconfigured id is not a price.
    throw new Error(`No such price: ${priceId}`)
  }
}
