/**
 * Questurian membership catalog — the product prices.
 *
 * Full rule: apps/questura/docs/membership-pricing.md
 *
 * One Stripe product: Questurian Membership. Monthly, yearly, and the $0.50
 * laptop test charge are prices on that product — not a second product.
 *
 * Site always advertises these catalog amounts. Laptop Checkout may charge
 * $0.50. That mismatch is intentional until serverless launch. Do not "fix"
 * the UI down to $0.50. To charge the real $12.99 / $79.99 for one test,
 * point host STRIPE_PRICE_ID_* at `STRIPE_MEMBERSHIP_PRICES.catalog` and
 * restart questura-server. See the doc.
 */
export const MEMBERSHIP_CATALOG = {
  monthly: {
    amount: 1299,
    currency: 'usd',
    interval: 'month',
  },
  yearly: {
    amount: 7999,
    currency: 'usd',
    interval: 'year',
  },
} as const

export type CatalogPlanId = keyof typeof MEMBERSHIP_CATALOG

/** The only membership product. Do not add another for testing. */
export const STRIPE_MEMBERSHIP_PRODUCT_ID = 'prod_V4XBrsC0ai3ZOY'

/**
 * Prices on Questurian Membership.
 *
 * Checkout uses whichever ID is in host `STRIPE_PRICE_ID_MONTHLY` /
 * `STRIPE_PRICE_ID_YEARLY`. These constants are the switch, not runtime
 * config — do not import them to bypass the env.
 */
export const STRIPE_MEMBERSHIP_PRICES = {
  catalog: {
    monthly: 'price_1U4P3aBUOUSxLiOZfKskTKeO',
    yearly: 'price_1U4P3bBUOUSxLiOZMGh7ZrJL',
  },
  laptopTestCharge: {
    monthly: 'price_1U5aq5BUOUSxLiOZMnZHT1eS',
  },
} as const
