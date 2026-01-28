import type Stripe from 'stripe'

/**
 * Extended Stripe Subscription interface with typed fields
 * that are normally untyped in the Stripe SDK
 */
export interface StripeSubscriptionExpanded extends Stripe.Subscription {
  current_period_end: number
  current_period_start: number
  cancel_at_period_end: boolean
}

/**
 * Stripe Price with expanded product
 */
export interface StripePriceWithProduct extends Stripe.Price {
  product: Stripe.Product
}
