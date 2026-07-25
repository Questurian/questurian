import type Stripe from 'stripe'
import { updateUserSubscription, getStripeSubscriptionDetails } from '@/payments/lib/payment-service'
import type { UserSubscriptionUpdate } from '@/payments/types'
import { APP_CONFIG } from '@/shared/config'
import { findVisitorProfileByStripeCustomerId, splitDisplayName } from '@/features/visitor-auth/lib/visitor-profile'
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

  if (!customerId || !subscriptionId) {
    logger.error('Missing customer or subscription ID in checkout session', {
      sessionId: session.id,
    })
    return
  }

  // Get subscription details to capture renewal date
  const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
  const subscriptionRenewsAt = subscriptionDetails?.currentPeriodEnd?.toISOString() || null

  if (!subscriptionRenewsAt) {
    logger.warn('Could not determine renewal date for subscription', { subscriptionId })
  }

  // Extract affiliate referral ID from metadata if present (and feature enabled)
  const updateData: UserSubscriptionUpdate = {
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: 'active',
    subscriptionRenewsAt
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
  if (billingName) {
    const profile = await findVisitorProfileByStripeCustomerId(customerId)
    if (profile && !profile.firstName && !profile.lastName) {
      const { firstName, lastName } = splitDisplayName(billingName)
      updateData.firstName = firstName
      updateData.lastName = lastName
    }
  }

  // Update user with subscription info
  const success = await updateUserSubscription(customerId, updateData)

  if (success) {
    logger.info('Visitor subscription activated via checkout completion', { subscriptionId })

    // Send membership confirmation email for new subscription
    await sendMembershipConfirmationAfterPayment(customerId, subscriptionId, true)
  } else {
    logger.error('Failed to update visitor subscription from checkout', { subscriptionId })
  }
}
