import type Stripe from 'stripe'
import { logger } from '@/shared/utils/logger'
import { resyncSubscription } from '@/payments/lib/subscription-resync'
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

export async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info('Processing invoice.payment_succeeded', { invoiceId: invoice.id })

  const subscriptionId = await resolveInvoiceSubscriptionId(invoice)

  if (!subscriptionId) {
    logger.info('Invoice not related to subscription, skipping', { invoiceId: invoice.id })
    return
  }

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
