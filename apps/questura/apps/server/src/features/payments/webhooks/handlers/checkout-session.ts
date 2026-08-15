import type Stripe from 'stripe'
import { updateUserSubscription } from '@/payments/lib/payment-service'
import { resyncSubscription } from '@/payments/lib/subscription-resync'
import type { UserSubscriptionUpdate } from '@/payments/types'
import { APP_CONFIG } from '@/shared/config'
import { splitDisplayName } from '@/features/visitor-auth/lib/visitor-profile'
import { resolveProfileForStripeCustomer } from '@/payments/lib/subscription-profile'
import { listBillableSubscriptions } from '@/payments/lib/customer-linkage'
import { stripe } from '@/payments/lib/stripe'
import { logger } from '@/shared/utils/logger'

type InvoiceWithPayment = Stripe.Invoice & {
  payment_intent?: string | Stripe.PaymentIntent | null
  charge?: string | Stripe.Charge | null
  payments?: { data?: Array<{ payment?: { payment_intent?: string | Stripe.PaymentIntent; charge?: string | Stripe.Charge } }> }
}

function paymentRefFromInvoice(invoice: InvoiceWithPayment): { paymentIntent?: string; charge?: string } {
  const paymentIntent =
    typeof invoice.payment_intent === 'string'
      ? invoice.payment_intent
      : invoice.payment_intent?.id
  const charge = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id
  if (paymentIntent || charge) return { paymentIntent, charge }

  for (const payment of invoice.payments?.data ?? []) {
    const intent = payment.payment?.payment_intent
    const intentId = typeof intent === 'string' ? intent : intent?.id
    if (intentId) return { paymentIntent: intentId }

    const paidCharge = payment.payment?.charge
    const chargeId = typeof paidCharge === 'string' ? paidCharge : paidCharge?.id
    if (chargeId) return { charge: chargeId }
  }

  return {}
}

async function refundDuplicateSubscription(subscription: Stripe.Subscription) {
  const invoiceId =
    typeof subscription.latest_invoice === 'string'
      ? subscription.latest_invoice
      : subscription.latest_invoice?.id

  if (!invoiceId) {
    logger.error('Duplicate subscription has no invoice to refund', {
      subscriptionId: subscription.id,
    })
    return
  }

  const invoice = (await stripe.invoices.retrieve(invoiceId, {
    expand: ['payments'],
  })) as InvoiceWithPayment
  const { paymentIntent, charge } = paymentRefFromInvoice(invoice)

  try {
    if (paymentIntent) {
      await stripe.refunds.create(
        { payment_intent: paymentIntent },
        { idempotencyKey: `dup-sub-refund-${subscription.id}` }
      )
      return
    }

    if (charge) {
      await stripe.refunds.create(
        { charge },
        { idempotencyKey: `dup-sub-refund-${subscription.id}` }
      )
      return
    }
  } catch (error) {
    logger.error('Failed to refund duplicate subscription', {
      subscriptionId: subscription.id,
      invoiceId,
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  logger.error('Duplicate subscription cancelled but no charge was found to refund', {
    subscriptionId: subscription.id,
    invoiceId,
  })
}

/**
 * Two Checkout sessions can both complete after the creation-time live-sub
 * check. Keep the oldest billable subscription, cancel and refund the rest,
 * then resync the one that remains.
 */
async function collapseDuplicateSubscriptions(
  customerId: string,
  checkoutSubscriptionId: string
): Promise<string> {
  const billable = await listBillableSubscriptions(customerId)

  if (billable.length <= 1) {
    return checkoutSubscriptionId
  }

  const kept = billable.reduce((oldest, subscription) =>
    subscription.created < oldest.created ? subscription : oldest
  )
  const extras = billable.filter((subscription) => subscription.id !== kept.id)

  logger.error('Customer has multiple live Stripe subscriptions; cancelling extras', {
    keptSubscriptionId: kept.id,
    extraSubscriptionIds: extras.map((subscription) => subscription.id),
  })

  for (const extra of extras) {
    await refundDuplicateSubscription(extra)
    await stripe.subscriptions.cancel(extra.id)
  }

  return kept.id
}

/**
 * Handle successful checkout completion.
 *
 * Entitlement is resync's job (ADR-0008). This handler only attaches
 * checkout-only fields (name, billing email, affiliate) after that write.
 * Returning without throwing used to 200 the webhook, so Stripe never retried
 * a paid session that failed to find a profile.
 */
export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  logger.info('Processing checkout.session.completed', { sessionId: session.id })

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  const visitorAuthUserId = session.metadata?.visitorAuthUserId ?? null

  if (!customerId || !subscriptionId) {
    throw new Error(
      `Checkout session ${session.id} is missing a customer or subscription id`
    )
  }

  const keptSubscriptionId = await collapseDuplicateSubscriptions(customerId, subscriptionId)
  const { profileId } = await resyncSubscription(keptSubscriptionId)

  if (!profileId) {
    throw new Error(`Failed to resync subscription ${keptSubscriptionId} after checkout`)
  }

  const extras: UserSubscriptionUpdate = {}

  if (APP_CONFIG.features.endorselyAffiliates) {
    const referralId = session.metadata?.endorsely_referral
    if (referralId) {
      logger.info('Subscription created via affiliate referral', { referralId, subscriptionId })
      extras.affiliateReferralId = referralId
      extras.affiliateReferredAt = new Date().toISOString()
    }
  }

  const billingName = session.customer_details?.name?.trim()
  const billingEmail = session.customer_details?.email?.trim()

  if (billingName || billingEmail) {
    const profile = await resolveProfileForStripeCustomer(customerId, visitorAuthUserId)

    if (billingName && profile && !profile.firstName && !profile.lastName) {
      const { firstName, lastName } = splitDisplayName(billingName)
      extras.firstName = firstName
      extras.lastName = lastName
    }

    // Checkout no longer requires a verified email, so the account address may
    // be mistyped. Stripe's address is confirmed by the payment, which makes it
    // the better fallback contact — but only worth storing when the two differ.
    if (billingEmail && profile) {
      const accountEmail = typeof profile.email === 'string' ? profile.email.trim() : ''
      if (accountEmail.toLowerCase() !== billingEmail.toLowerCase()) {
        extras.billingEmail = billingEmail
        logger.warn('Checkout billing email differs from account email', {
          subscriptionId,
          profileId: profile.id,
        })
      }
    }
  }

  if (Object.keys(extras).length === 0) {
    logger.info('Visitor subscription resynced via checkout completion', { subscriptionId })
    return
  }

  const success = await updateUserSubscription(customerId, extras, visitorAuthUserId)

  if (!success) {
    throw new Error(`Failed to store checkout extras for subscription ${subscriptionId}`)
  }

  logger.info('Visitor subscription activated via checkout completion', { subscriptionId })
}
