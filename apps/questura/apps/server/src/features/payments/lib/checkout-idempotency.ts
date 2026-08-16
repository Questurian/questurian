import { createHash } from 'node:crypto'

/**
 * Idempotency keys for `checkout.sessions.create`.
 *
 * Without a key, a double-clicked buy button creates two Checkout Sessions on
 * the same customer. Only one can be paid — `findLiveSubscription` blocks the
 * second — but the stray session still lands in the Dashboard and still has to
 * be reasoned about. A key collapses the retry at Stripe instead.
 *
 * Two properties matter, and they pull against each other:
 *
 *  1. **The key must cover every parameter that varies.** Stripe rejects a
 *     reused key whose request body differs from the first ("Keys for
 *     idempotent requests can only be used with the same parameters"). `plan`,
 *     `returnTo` (which lands in `success_url`) and the affiliate referral are
 *     all caller-influenced, so a key built from the visitor alone would turn a
 *     visitor who opened checkout from two different pages into a hard 500.
 *     Hashing the request itself makes a genuinely different request a
 *     genuinely different key.
 *
 *  2. **The key must expire well before the session does.** Stripe replays a
 *     key for 24h and returns *the original object*. A Checkout Session also
 *     expires after ~24h, so a visitor who abandoned checkout and came back
 *     later could be handed back a session that is already expired — a pay
 *     button that goes nowhere, with nothing in the logs to say why. The time
 *     bucket keeps the replay window far shorter than the session lifetime.
 *
 * Five minutes is comfortably longer than any double-click or retry storm and
 * far shorter than the session's own expiry.
 */
export const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000

/** The request fields that must produce a different session when they differ. */
export type CheckoutIdempotencyInput = {
  visitorAuthUserId: string
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
  referralId: string | null
  allowPromotionCodes: boolean
}

/**
 * A stable key for one logical checkout attempt.
 *
 * `now` is injectable so tests can sit on a bucket boundary rather than sleep
 * through one.
 */
export function checkoutIdempotencyKey(
  input: CheckoutIdempotencyInput,
  now: number = Date.now()
): string {
  const bucket = Math.floor(now / CHECKOUT_IDEMPOTENCY_WINDOW_MS)

  // Field order is fixed here rather than left to JSON key order so the digest
  // cannot drift if the input type is later reordered. NUL joins the fields
  // because it is the one byte none of them can contain — a printable separator
  // would let two different inputs collide by straddling it.
  const fingerprint = createHash('sha256')
    .update(
      [
        input.visitorAuthUserId,
        input.customerId,
        input.priceId,
        input.successUrl,
        input.cancelUrl,
        input.referralId ?? '',
        String(input.allowPromotionCodes),
        String(bucket),
      ].join('\u0000')
    )
    .digest('hex')

  // Stripe caps idempotency keys at 255 chars; this is a fixed 73.
  return `checkout:${fingerprint}`
}
