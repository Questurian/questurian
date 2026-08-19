import { logger } from '@/shared/utils/logger'
import { stripe } from './stripe'
import {
  ACCESS_REVOKED_METADATA_KEY,
  ACCESS_REVOKED_METADATA_VALUE,
  ACCESS_REVOKED_PERIOD_END_METADATA_KEY,
  ACCESS_REVOKED_REASON_METADATA_KEY,
  type AccessRevocation,
} from './subscription-state'

/**
 * Whether this is the SDK's "Stripe rejected the request itself" error.
 *
 * `rawType` carries the API's own error type (`invalid_request_error`); `type`
 * carries the SDK's *class name* (`StripeInvalidRequestError`). Reading `type`
 * and comparing it to the API spelling matches nothing a real client ever
 * throws, which is exactly how this guard came to reject every error it was
 * written to recognise. Both spellings are accepted so neither reading can
 * silently fail again.
 */
function isInvalidRequestError(error: unknown): boolean {
  const { type, rawType } = (error ?? {}) as { type?: string; rawType?: string }

  return rawType === 'invalid_request_error' || type === 'StripeInvalidRequestError'
}

/**
 * Whether Stripe rejected this write because the subscription is already over.
 *
 * Stripe refuses most updates to a `canceled` subscription — "a canceled
 * subscription can only update its cancellation_details" — and it is not
 * documented whether a metadata-only update is exempt. Rather than guess, the
 * error path asks Stripe for the status: if the subscription really is
 * cancelled, the rejection is the expected one and the caller falls back;
 * anything else (bad key, wrong account, an outage) still propagates so the
 * webhook retries instead of quietly writing the wrong entitlement.
 *
 * The status check runs only after a failure, so the happy path costs nothing.
 * If Stripe does allow the write, this branch is simply never taken.
 */
async function rejectedForCancelledSubscription(
  subscriptionId: string,
  error: unknown
): Promise<boolean> {
  if (!isInvalidRequestError(error)) return false

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    return subscription.status === 'canceled'
  } catch {
    // The status is unknowable, so the original rejection stands unexplained.
    return false
  }
}

/**
 * Write — or, with `null`, clear — the revocation flag on a Stripe subscription.
 *
 * Returns whether the flag actually landed. `false` means the subscription was
 * already cancelled and Stripe refused the write; the profile still has to be
 * brought in line, so the caller must pass the same revocation to
 * `resyncSubscription` as `accessRevoked` rather than letting it re-read the
 * metadata that was never updated.
 *
 * This is the common shape of a refund, not an edge case: support cancels the
 * subscription and *then* refunds the charge, so `charge.refunded` routinely
 * arrives against a cancelled subscription. Throwing there would 500 the
 * webhook, Stripe would retry for three days and never succeed, and the
 * refunded visitor would keep their access with `paidThroughAt` still sitting
 * at the period end they were given their money back for.
 */
export async function writeAccessRevocation(
  subscriptionId: string,
  revocation: AccessRevocation | null
): Promise<boolean> {
  try {
    // Stripe deletes a metadata key when its value is the empty string, so a
    // restore clears all three in one update.
    await stripe.subscriptions.update(subscriptionId, {
      metadata: {
        [ACCESS_REVOKED_METADATA_KEY]: revocation ? ACCESS_REVOKED_METADATA_VALUE : '',
        [ACCESS_REVOKED_REASON_METADATA_KEY]: revocation ? revocation.reason : '',
        [ACCESS_REVOKED_PERIOD_END_METADATA_KEY]:
          revocation && revocation.periodEnd ? String(revocation.periodEnd) : '',
      },
    })

    return true
  } catch (error) {
    if (!(await rejectedForCancelledSubscription(subscriptionId, error))) throw error

    logger.warn('Stripe refused the revocation flag on a cancelled subscription', {
      subscriptionId,
      revoking: Boolean(revocation),
      reason: revocation?.reason ?? null,
      error: error instanceof Error ? error.message : String(error),
    })

    return false
  }
}

/**
 * Stop the billing a fully refunded subscription would otherwise carry on doing.
 *
 * Refunding a charge gives one period's money back; it does not tell Stripe to
 * stop charging. Left alone the subscription renews on schedule, and because
 * the revocation flag holds `paidThroughAt` at null until a *later* period is
 * paid, the visitor is billed for a month of nothing and only then gets access
 * back (`clearRefundRevocationOnNewPeriod`). Cancelling closes that window:
 * money back, billing stopped, access off, in one webhook rather than in a
 * Dashboard step somebody has to remember.
 *
 * Cancelling is not prorated and raises no invoice, so it never hands out a
 * second refund on top of the one that triggered it. It is also idempotent in
 * effect: a subscription support already cancelled before refunding — the
 * ordinary flow — makes Stripe reject the call, and an already-`canceled`
 * subscription is the outcome this wanted anyway. Any other rejection still
 * propagates so the webhook retries instead of leaving a live subscription
 * billing a refunded visitor.
 *
 * An *open* dispute deliberately does not take this path: it may still be won,
 * and a cancelled subscription cannot be un-cancelled. A dispute that closes as
 * lost does take it — that money is back with the visitor for good, and leaving
 * the subscription alive there billed them monthly behind a revocation flag only
 * a won dispute could ever have lifted.
 */
export async function cancelRefundedSubscription(subscriptionId: string): Promise<void> {
  try {
    await stripe.subscriptions.cancel(subscriptionId, {
      cancellation_details: { comment: 'Cancelled automatically after a full refund' },
    })

    logger.warn('Cancelled subscription after a full refund', { subscriptionId })
  } catch (error) {
    if (!(await rejectedForCancelledSubscription(subscriptionId, error))) throw error

    logger.info('Refunded subscription was already cancelled', { subscriptionId })
  }
}
