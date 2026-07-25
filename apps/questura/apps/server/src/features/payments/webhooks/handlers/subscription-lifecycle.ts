import type Stripe from 'stripe'
import { updateUserSubscription, mapStripeStatusToInternal } from '@/payments/lib/payment-service'
import { convertStripeTimestamp } from '@/payments/lib/payment-helpers'
import type { StripeSubscriptionExpanded } from '@/payments/types'
import { logger } from '@/shared/utils/logger'
import { resolveRenewalDate } from '../renewal-date'
import { sendMembershipConfirmationAfterPayment, sendSubscriptionCancellationEmail } from '../notifications'

/**
 * Handle subscription creation
 */
export async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.created', { subscriptionId: subscription.id })

  const customerId = subscription.customer as string

  const status = mapStripeStatusToInternal(subscription.status)

  // Get renewal date for active subscriptions
  const subscriptionRenewsAt = status === 'active' ? await resolveRenewalDate(subscription) : null

  await updateUserSubscription(customerId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionRenewsAt
  })

  logger.info('User subscription created', { subscriptionId: subscription.id, status })

  // Send membership confirmation email for active subscriptions
  if (status === 'active') {
    await sendMembershipConfirmationAfterPayment(customerId, subscription.id, true)
  }
}

/**
 * Handle subscription status updates
 * This covers status changes like active -> past_due -> cancelled
 */
export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.updated', {
    subscriptionId: subscription.id,
    status: subscription.status,
  })
  const expandedSubscription = subscription as StripeSubscriptionExpanded

  const customerId = subscription.customer as string

  // GUARD: Skip webhook for staff members
  const status = mapStripeStatusToInternal(subscription.status)
  const cancelAtPeriodEnd = expandedSubscription.cancel_at_period_end || false

  // Get renewal date for active subscriptions, clear for inactive ones
  const subscriptionRenewsAt = status === 'active' ? await resolveRenewalDate(subscription) : null

  // Set membershipExpiration when subscription is cancelled but still active
  // (the paid period runs to the same current-period-end a renewal would use).
  // Stays null when the subscription is renewing, which clears any previous value.
  let membershipExpiration: string | null = null
  if (cancelAtPeriodEnd && status === 'active') {
    membershipExpiration = subscriptionRenewsAt
    if (membershipExpiration) {
      logger.info('Subscription cancelled but active until period end', {
        subscriptionId: subscription.id,
        membershipExpiration,
      })
    }
  }

  await updateUserSubscription(customerId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionRenewsAt,
    cancelAtPeriodEnd,
    membershipExpiration
  })

  logger.info('User subscription updated', {
    subscriptionId: subscription.id,
    status,
    cancelAtPeriodEnd,
  })
}

/**
 * Handle subscription deletion/cancellation
 * Honor the paid period by setting membershipExpiration to current_period_end
 */
export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  logger.info('Processing customer.subscription.deleted', { subscriptionId: subscription.id })

  const customerId = subscription.customer as string

  const expandedSubscription = subscription as StripeSubscriptionExpanded

  // Calculate when the paid period actually ends
  const currentPeriodEnd = convertStripeTimestamp(expandedSubscription.current_period_end)
  const now = new Date()

  // If the subscription period hasn't ended yet, honor the paid time
  let membershipExpiration: string | null = null
  if (currentPeriodEnd && currentPeriodEnd > now) {
    membershipExpiration = currentPeriodEnd.toISOString()
    logger.info('Honoring paid period after cancellation', {
      subscriptionId: subscription.id,
      membershipExpiration,
    })
  } else if (!currentPeriodEnd) {
    logger.warn('Could not convert subscription period end date, treating as immediate revocation', {
      subscriptionId: subscription.id,
    })
  }

  await updateUserSubscription(customerId, {
    subscriptionStatus: 'cancelled',
    membershipExpiration,
    subscriptionRenewsAt: null, // Clear renewal date for cancelled subscriptions
    cancelAtPeriodEnd: false // Clear cancel flag since subscription is now fully deleted
  })

  logger.info('User subscription cancelled', { subscriptionId: subscription.id })

  // Send cancellation email - this is typically triggered by Stripe when the subscription period actually ends
  const wasImmediate = !membershipExpiration // If no expiration, access was revoked immediately
  await sendSubscriptionCancellationEmail(customerId, subscription.id, membershipExpiration ? new Date(membershipExpiration) : null, wasImmediate)
}
