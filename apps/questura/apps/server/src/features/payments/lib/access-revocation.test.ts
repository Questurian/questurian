import { describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { stripeInvalidRequestError } from '../__fixtures__/stripe-errors'

/**
 * The assumption `rejectedForCancelledSubscription` rests on, pinned.
 *
 * The cancel-then-refund fallback read `error.type` and compared it to
 * `invalid_request_error`. That is the API's spelling, but the SDK puts the
 * API's spelling on `rawType` and sets `type` to the error's *class name*, so
 * the comparison matched nothing a real client throws. Every refund against an
 * already-cancelled subscription — the ordinary refund order — rethrew, 500'd
 * the webhook, and left the refunded visitor's access intact while Stripe
 * retried for three days.
 *
 * The behavioural tests in `stripe-webhook.route.test.ts` cover what the
 * handlers then do. These assert the shape those tests depend on, straight from
 * the pinned SDK, so an upgrade that moves either field fails here — loudly and
 * in one place — rather than silently in production.
 */
describe('the Stripe SDK error shape the revocation fallback depends on', () => {
  it('puts the API error type on rawType, not on type', () => {
    const error = stripeInvalidRequestError('A canceled subscription can only update its cancellation_details.')

    expect(error.rawType).toBe('invalid_request_error')
    expect(error.type).toBe('StripeInvalidRequestError')
  })

  it('never spells type as the API error type, which is what the old guard looked for', () => {
    const error = stripeInvalidRequestError('anything')

    expect(error.type).not.toBe('invalid_request_error')
  })

  it('is a real Error, so an unrecognised rejection still propagates as one', () => {
    const error = stripeInvalidRequestError('Invalid API Key provided')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(Stripe.errors.StripeInvalidRequestError)
    expect(error.message).toBe('Invalid API Key provided')
  })
})
