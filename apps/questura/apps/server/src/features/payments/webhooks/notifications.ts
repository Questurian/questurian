import { getPayload } from 'payload'
import config from '@/payload.config'
import { getStripeSubscriptionDetails } from '@/payments/lib/payment-service'
import { getSubscriptionProductName } from '@/payments/lib/payment-helpers'
import { sendMembershipConfirmationEmail, sendSubscriptionCancelledEmail } from '@/emails'
import { findVisitorProfileByStripeCustomerId } from '@/features/visitor-auth/lib/visitor-profile'
import { logger } from '@/shared/utils/logger'

/**
 * Send membership confirmation email after successful payment
 */
export async function sendMembershipConfirmationAfterPayment(
  customerId: string,
  subscriptionId: string,
  isRecurring: boolean = true
) {
  try {
    const payload = await getPayload({ config })

    const profile = await findVisitorProfileByStripeCustomerId(customerId)
    if (!profile) {
      logger.error('No VisitorProfile found for membership confirmation email', { subscriptionId })
      return
    }

    // Get subscription details for the email
    const subscriptionDetails = await getStripeSubscriptionDetails(subscriptionId)
    if (!subscriptionDetails) {
      logger.error('Could not retrieve subscription details for email', { subscriptionId })
      return
    }

    // Get Stripe product information for subscription type
    const subscriptionType = await getSubscriptionProductName(subscriptionId)

    // Send the membership confirmation email
    await sendMembershipConfirmationEmail(payload, {
      email: profile.email,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      subscriptionType,
      membershipExpiresAt: subscriptionDetails.currentPeriodEnd || undefined,
      isRecurring
    })

    logger.info('Membership confirmation email sent', { profileId: profile.id, subscriptionId })
  } catch (error) {
    logger.error('Failed to send membership confirmation email', {
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Send subscription cancellation email after cancellation
 */
export async function sendSubscriptionCancellationEmail(
  customerId: string,
  subscriptionId: string,
  membershipExpiresAt: Date | null,
  wasImmediate: boolean = false
) {
  try {
    const payload = await getPayload({ config })

    const profile = await findVisitorProfileByStripeCustomerId(customerId)
    if (!profile) {
      logger.error('No VisitorProfile found for cancellation email', { subscriptionId })
      return
    }

    // Get Stripe product information for subscription type
    const subscriptionType = await getSubscriptionProductName(subscriptionId)

    // Send the cancellation email
    await sendSubscriptionCancelledEmail(payload, {
      email: profile.email,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
      subscriptionType,
      membershipExpiresAt: membershipExpiresAt || undefined,
      wasImmediate
    })

    logger.info('Subscription cancellation email sent', { profileId: profile.id, subscriptionId })
  } catch (error) {
    logger.error('Failed to send subscription cancellation email', {
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
