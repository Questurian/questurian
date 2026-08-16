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
  if ((error as { type?: string }).type !== 'invalid_request_error') return false

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
