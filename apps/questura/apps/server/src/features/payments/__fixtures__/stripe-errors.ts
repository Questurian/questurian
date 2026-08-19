import Stripe from 'stripe'

/**
 * Stripe rejections for tests, built by the SDK's own error classes.
 *
 * Hand-shaped rejections are why the cancelled-subscription refund path was
 * broken in production while its tests passed. Every fixture asserted
 * `Object.assign(new Error(...), { type: 'invalid_request_error' })`, but a
 * real client sets `type` to the *class name* and puts the API's spelling on
 * `rawType`. The fixtures described an error Stripe has never thrown, so the
 * guard reading `type` looked correct in every test and matched nothing live.
 *
 * Constructing through `Stripe.errors` is the fix: the shape comes from the
 * pinned SDK, so a fixture cannot drift from what the SDK actually throws, and
 * an SDK upgrade that changes the shape breaks these tests rather than
 * production.
 */
export function stripeInvalidRequestError(message: string): Stripe.errors.StripeInvalidRequestError {
  return new Stripe.errors.StripeInvalidRequestError({
    type: 'invalid_request_error',
    message,
  })
}

/** Stripe's rejection when a subscription is already `canceled`. */
export function cancelledSubscriptionError(): Stripe.errors.StripeInvalidRequestError {
  return stripeInvalidRequestError(
    'A canceled subscription can only update its cancellation_details.'
  )
}

/** An `invalid_request_error` that has nothing to do with cancellation. */
export function badApiKeyError(): Stripe.errors.StripeInvalidRequestError {
  return stripeInvalidRequestError('Invalid API Key provided')
}
