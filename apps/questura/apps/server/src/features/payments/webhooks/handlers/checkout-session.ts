import type Stripe from 'stripe'
import { updateUserSubscription } from '@/payments/lib/payment-service'
import type { UserSubscriptionUpdate } from '@/payments/types'
import { APP_CONFIG } from '@/shared/config'
import { splitDisplayName } from '@/features/visitor-auth/lib/visitor-profile'
import { resolveProfileForStripeCustomer } from '@/payments/lib/subscription-profile'
import { logger } from '@/shared/utils/logger'
import { sendMembershipConfirmationAfterPayment } from '../notifications'

/**
 * Handle successful checkout completion
 * This is triggered when a user completes their subscription checkout
 */
export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  logger.info('Processing checkout.session.completed', { sessionId: session.id })

  const customerId = session.customer as string
  const subscriptionId = session.subscription as string
  // Written by the checkout route. Survives a profile row that lost, or never
  // stored, its Stripe linkage — without it a completed payment can land on
  // nobody.
  const visitorAuthUserId = session.metadata?.visitorAuthUserId ?? null

  if (!customerId || !subscriptionId) {
    logger.error('Missing customer or subscription ID in checkout session', {
      sessionId: session.id,
    })
    return
  }

  // No date is captured here. Checkout only links the subscription and marks it
  // active; `paidThroughAt` is written by the subscription resync, which is the
  // single writer of subscription state and derives the date from an invoice
  // that has actually been paid rather than from `current_period_end`
  // (ADR-0008).
  const updateData: UserSubscriptionUpdate = {
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: 'active'
  }

  if (APP_CONFIG.features.endorselyAffiliates) {
    const referralId = session.metadata?.endorsely_referral
    if (referralId) {
      logger.info('Subscription created via affiliate referral', { referralId, subscriptionId })
      // Store affiliate referral info
      updateData.affiliateReferralId = referralId
      updateData.affiliateReferredAt = new Date().toISOString()
    }
  }

  // Capture the billing name Stripe collected at checkout, but only if the
  // visitor profile doesn't already have a name (don't clobber a name the user
  // set themselves in settings/account).
  const billingName = session.customer_details?.name?.trim()
  const billingEmail = session.customer_details?.email?.trim()

  if (billingName || billingEmail) {
    const profile = await resolveProfileForStripeCustomer(customerId, visitorAuthUserId)

    if (billingName && profile && !profile.firstName && !profile.lastName) {
      const { firstName, lastName } = splitDisplayName(billingName)
      updateData.firstName = firstName
      updateData.lastName = lastName
    }

    // Checkout no longer requires a verified email, so the account address may
    // be mistyped. Stripe's address is confirmed by the payment, which makes it
    // the better fallback contact — but only worth storing when the two differ.
    // Compare case-insensitively so casing alone doesn't flag a mismatch.
    if (billingEmail && profile) {
      const accountEmail = typeof profile.email === 'string' ? profile.email.trim() : ''
      if (accountEmail.toLowerCase() !== billingEmail.toLowerCase()) {
        updateData.billingEmail = billingEmail
        logger.warn('Checkout billing email differs from account email', {
          subscriptionId,
          profileId: profile.id,
        })
      }
    }
  }

  // Update user with subscription info
  const success = await updateUserSubscription(customerId, updateData, visitorAuthUserId)

  if (success) {
    logger.info('Visitor subscription activated via checkout completion', { subscriptionId })

    // Send membership confirmation email for new subscription
    await sendMembershipConfirmationAfterPayment(customerId, subscriptionId, true)
  } else {
    logger.error('Failed to update visitor subscription from checkout', { subscriptionId })
  }
}
