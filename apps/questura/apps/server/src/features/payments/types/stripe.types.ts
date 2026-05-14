import type Stripe from 'stripe'

export interface StripeSubscriptionExpanded extends Stripe.Subscription {
  current_period_end: number
  current_period_start: number
  cancel_at_period_end: boolean
}

export interface StripePriceWithProduct extends Stripe.Price {
  product: Stripe.Product
}
