import Stripe from 'stripe'
import { APP_CONFIG } from '@/shared/config'

/**
 * Pin the Stripe API version the SDK was typed against.
 *
 * `current_period_end` lives on the subscription item in this version
 * (ADR-0008). An unpinned client follows whatever the installed SDK defaults
 * to after an upgrade, and `getPeriod` starts returning nulls — every member
 * loses access. Bumping this is a deliberate, reviewed change.
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2025-08-27.basil'

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!APP_CONFIG.stripe.secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
    }
    stripeInstance = new Stripe(APP_CONFIG.stripe.secretKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    })
  }
  return stripeInstance
}

// For backwards compatibility
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as any)[prop]
  }
})

