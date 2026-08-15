import type Stripe from 'stripe'
import { logger } from '@/shared/utils/logger'
import { stripe } from '@/payments/lib/stripe'
import { resyncSubscription } from '@/payments/lib/subscription-resync'
import {
  ACCESS_REVOKED_METADATA_KEY,
  ACCESS_REVOKED_METADATA_VALUE,
  ACCESS_REVOKED_PERIOD_END_METADATA_KEY,
  ACCESS_REVOKED_REASON_METADATA_KEY,
  ACCESS_REVOKED_REASON_REFUND,
  getSubscriptionPeriodSeconds,
} from '@/payments/lib/subscription-state'
import { resolveInvoiceSubscriptionId } from '../invoice-subscription'

/**
 * Invoice webhooks are re-sync triggers, not writers (ADR-0008).
 *
 * `invoice.payment_failed` used to write `past_due` from its own reasoning.
 * Two independent writers of the same fields had to agree forever, and invoice
 * events were never covered by the ordering guard, so a late failure could
 * stamp `past_due` over a subscription that had already recovered. Both
 * handlers now resolve the subscription and let the subscription object decide.
 */

/**
 * Billing reasons that mean money was collected for a period that had not been
 * paid for yet. `subscription_create` is excluded: nothing can have been
 * revoked before the subscription's first invoice, and skipping it keeps the
 * extra subscription fetch off the checkout path.
 */
const NEW_PERIOD_BILLING_REASONS = new Set<Stripe.Invoice.BillingReason>([
  'subscription_cycle',
  'subscription_update',
])

/**
 * Lift a refund's revocation once a later period has actually been paid for.
 *
 * `access_revoked` is written when a charge is fully refunded, and
 * `deriveSubscriptionState` then forces `paidThroughAt: null` on every resync
 * that follows. Stripe does not cancel a subscription because one of its
 * invoices was refunded, so without this the visitor keeps being billed
 * successfully, month after month, while the flag silently denies them access
 * — and nothing but a won dispute ever clears it.
 *
 * Two things must not clear it. A dispute is money still being contested, so
 * only `charge.dispute.closed` may resolve one. And a retry of the refunded
 * invoice itself is not a new period: comparing the subscription's current
 * period start against the revoked period's end separates the two, because a
 * retry leaves the subscription sitting in the period that was refunded.
 *
 * A revocation written before this metadata existed carries no reason and no
 * period end. Those are treated as refunds and cleared: a wrongly cleared
 * dispute is corrected by its own `closed` event, whereas a wrongly kept
 * refund locks a paying visitor out permanently.
 */
async function clearRefundRevocationOnNewPeriod(
  invoice: Stripe.Invoice,
  subscriptionId: string
): Promise<void> {
  const billingReason = invoice.billing_reason
  if (!billingReason || !NEW_PERIOD_BILLING_REASONS.has(billingReason)) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const metadata = subscription.metadata ?? {}

  if (metadata[ACCESS_REVOKED_METADATA_KEY] !== ACCESS_REVOKED_METADATA_VALUE) return

  const reason = metadata[ACCESS_REVOKED_REASON_METADATA_KEY]
  if (reason && reason !== ACCESS_REVOKED_REASON_REFUND) return

  const revokedPeriodEnd = Number(metadata[ACCESS_REVOKED_PERIOD_END_METADATA_KEY])
  const { start: paidPeriodStart } = getSubscriptionPeriodSeconds(subscription)

  if (
    Number.isFinite(revokedPeriodEnd) &&
    revokedPeriodEnd > 0 &&
    paidPeriodStart !== null &&
    paidPeriodStart < revokedPeriodEnd
  ) {
    return
  }

  logger.warn('Restoring membership: a period after the refunded one was paid', {
    invoiceId: invoice.id,
    subscriptionId,
    revokedPeriodEnd: Number.isFinite(revokedPeriodEnd) ? revokedPeriodEnd : null,
    paidPeriodStart,
  })

  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      [ACCESS_REVOKED_METADATA_KEY]: '',
      [ACCESS_REVOKED_REASON_METADATA_KEY]: '',
      [ACCESS_REVOKED_PERIOD_END_METADATA_KEY]: '',
    },
  })
}

export async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info('Processing invoice.payment_succeeded', { invoiceId: invoice.id })

  const subscriptionId = await resolveInvoiceSubscriptionId(invoice)

  if (!subscriptionId) {
    logger.info('Invoice not related to subscription, skipping', { invoiceId: invoice.id })
    return
  }

  // Before the resync, so the state it derives already reflects the cleared flag.
  await clearRefundRevocationOnNewPeriod(invoice, subscriptionId)

  await resyncSubscription(subscriptionId)
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  logger.info('Processing invoice.payment_failed', { invoiceId: invoice.id })

  const subscriptionId = await resolveInvoiceSubscriptionId(invoice)

  if (!subscriptionId) {
    logger.info('Invoice not related to subscription, skipping', { invoiceId: invoice.id })
    return
  }

  // Resync opens the dunning grace when Stripe reports past_due, so paid access
  // survives the retry window instead of ending on the first decline.
  await resyncSubscription(subscriptionId)

  logger.warn('Subscription payment failed; dunning grace applies', {
    invoiceId: invoice.id,
    subscriptionId,
  })
}
