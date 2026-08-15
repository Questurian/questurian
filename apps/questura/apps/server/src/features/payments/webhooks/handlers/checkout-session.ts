import type Stripe from 'stripe'
import { updateUserSubscription } from '@/payments/lib/payment-service'
import { resyncSubscription } from '@/payments/lib/subscription-resync'
import type { UserSubscriptionUpdate } from '@/payments/types'
import { APP_CONFIG } from '@/shared/config'
import { splitDisplayName } from '@/features/visitor-auth/lib/visitor-profile'
import { resolveProfileForStripeCustomer } from '@/payments/lib/subscription-profile'
import { logger } from '@/shared/utils/logger'

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

  const { profileId } = await resyncSubscription(subscriptionId)

  if (!profileId) {
    throw new Error(`Failed to resync subscription ${subscriptionId} after checkout`)
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
