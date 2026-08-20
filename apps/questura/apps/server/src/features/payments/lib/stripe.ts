import Stripe from 'stripe'
import { APP_CONFIG } from '@/shared/config'

/**
 * The pinned API version, defined in `stripe-api-version.ts` and re-exported
 * here so existing importers keep working. The batch scripts import the leaf
 * directly rather than this module, which would pull `APP_CONFIG` in with it.
 */
import { STRIPE_API_VERSION } from './stripe-api-version'

export { STRIPE_API_VERSION }

/**
 * Bound a single Stripe request so one hung call cannot hold a whole request.
 *
 * stripe-node's own default is 80s (`DEFAULT_TIMEOUT` in
 * `stripe/cjs/stripe.core.js`), and it retries a timed-out request, so today a
 * network black hole can pin one call for 80s and one webhook — which makes up
 * to ~9 sequential Stripe calls on the dispute-closed path — for minutes.
 * Stripe gives a webhook endpoint on the order of 20s to answer before it
 * records the delivery as failed and schedules a redelivery, so a call still
 * running after 8s has already lost that race; holding the socket open only
 * stacks the redelivery on top of a request that is still in flight, and the
 * same client serves `create-checkout-session`, where the wait is a visitor
 * staring at a dead Subscribe button. 8s is ~4x the slowest calls we make
 * (list/search endpoints), so it cannot trip on ordinary latency.
 */
const STRIPE_REQUEST_TIMEOUT_MS = 8_000

/**
 * One retry, not the SDK's default of two, because retries cost wall clock.
 *
 * Retrying is safe here: stripe-node's `_defaultIdempotencyKey` attaches a
 * generated `Idempotency-Key` to every v1 POST whenever `maxNetworkRetries > 0`
 * ("If this is a POST and we allow multiple retries, ensure an idempotency
 * key"), and the header block is built once in `prepareAndMakeRequest` and
 * handed unchanged to each attempt — so a retried `refunds.create` replays the
 * first refund instead of issuing a second one. What retries are not free of is
 * time: an attempt that times out is itself retried, so the worst case for one
 * call is timeout + backoff + timeout. At one retry that is ~8s + ~0.5s + 8s ≈
 * 17s, still inside the webhook window; at the default two it is ~26s, which
 * guarantees the redelivery this timeout exists to avoid.
 */
const STRIPE_MAX_NETWORK_RETRIES = 1

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!APP_CONFIG.stripe.secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
    }
    stripeInstance = new Stripe(APP_CONFIG.stripe.secretKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      timeout: STRIPE_REQUEST_TIMEOUT_MS,
      maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
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

