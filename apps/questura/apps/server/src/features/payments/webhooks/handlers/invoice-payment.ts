import type Stripe from 'stripe'
import { updateUserSubscription, getStripeSubscriptionDetails } from '@/payments/lib/payment-service'
import { logger } from '@/shared/utils/logger'
import { resolveInvoiceSubscriptionId } from '../invoice-subscription'
import { sendMembershipConfirmationAfterPayment } from '../notifications'

/**
 * Handle successful invoice payments
 * This is triggered for recurring subscription payments and serves as payment confirmation
 * Also updates the renewal date for subscription renewals
 */
export async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info('Processing invoice.payment_succeeded', { invoiceId: invoice.id })

  const customerId = invoice.customer as string

  const subscriptionId = await resolveInvoiceSubscriptionId(invoice)

  if (!subscriptionId) {
    logger.info('Invoice not related to subscription, skipping', { invoiceId: invoice.id })
    return
  }

  const billingReason = (invoice as any).billing_reason

  logger.info('Payment successful for subscription', { subscriptionId, billingReason })

  // For renewal payments, update the subscription renewal date
  if (billingReason === 'subscription_cycle') {
    try {
      const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
      if (subscriptionDetails?.currentPeriodEnd) {
        const updatedRenewalDate = subscriptionDetails.currentPeriodEnd.toISOString()

        await updateUserSubscription(customerId, {
          subscriptionRenewsAt: updatedRenewalDate
        })

        logger.info('Renewal date updated after renewal payment', {
          subscriptionId,
          subscriptionRenewsAt: updatedRenewalDate,
        })
      }
    } catch (error) {
      logger.error('Failed to update renewal date on subscription renewal', {
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't fail the webhook if renewal date update fails - the subscription is still active
    }
  }

  // Send membership confirmation email only for new subscriptions
  // Regular renewals are handled silently (renewal date already updated above)
  if (billingReason === 'subscription_create') {
    await sendMembershipConfirmationAfterPayment(customerId, subscriptionId, true)
  }
}

/**
 * Handle failed invoice payments
 * This can lead to past_due status
 */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  logger.info('Processing invoice.payment_failed', { invoiceId: invoice.id })

  const subscriptionId = await resolveInvoiceSubscriptionId(invoice)
  if (!subscriptionId) {
    logger.info('Invoice not related to subscription, skipping', { invoiceId: invoice.id })
    return
  }

  const customerId = invoice.customer as string

  // Mark as past due, but don't immediately revoke membership
  // Stripe will handle the subscription status updates
  await updateUserSubscription(customerId, {
    subscriptionStatus: 'past_due'
  })

  logger.warn('User subscription marked as past due after payment failure', {
    invoiceId: invoice.id,
    subscriptionId,
  })
}
