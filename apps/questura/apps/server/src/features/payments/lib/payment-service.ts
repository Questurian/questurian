import { getPayload } from 'payload'
import config from '@/payload.config'
import { logger } from '@/shared/utils/logger'
import { stripe } from './stripe'
import { sendSubscriptionCancelledEmail, sendSubscriptionReactivatedEmail } from '@/emails'
import { convertStripeTimestamp, getSubscriptionProductName } from './payment-helpers'
import type { StripeSubscriptionExpanded, UserSubscriptionUpdate } from '../types'
import {
  findVisitorProfileByAuthUserId,
  findVisitorProfileByStripeCustomerId,
} from '@/features/visitor-auth/lib/visitor-profile'

/**
 * Stripe returns current_period_end/start on the first subscription item,
 * not at the subscription root.
 */
function getFirstSubscriptionItem(
  subscription: StripeSubscriptionExpanded
): { current_period_end?: number | null; current_period_start?: number | null } | null {
  if (subscription.items && Array.isArray(subscription.items.data) && subscription.items.data.length > 0) {
    return subscription.items.data[0] as any
  }
  return null
}

/**
 * Extract the subscription's current period end from items.data[0] and
 * convert it to a Date. Returns null when it can't be determined.
 */
export function getCurrentPeriodEnd(subscription: StripeSubscriptionExpanded): Date | null {
  return convertStripeTimestamp(getFirstSubscriptionItem(subscription)?.current_period_end || null)
}

/**
 * Updates a VisitorProfile subscription based on Stripe customer ID.
 */
export async function updateUserSubscription(
  stripeCustomerId: string,
  updates: UserSubscriptionUpdate
): Promise<boolean> {
  try {
    const payload = await getPayload({ config })

    const profile = await findVisitorProfileByStripeCustomerId(stripeCustomerId)

    if (!profile) {
      logger.error('No VisitorProfile found for Stripe customer', { stripeCustomerId })
      return false
    }

    await payload.update({
      collection: 'visitor-profiles',
      id: profile.id,
      data: updates
    })

    logger.info('Updated VisitorProfile subscription', {
      profileId: profile.id,
      updatedFields: Object.keys(updates),
    })

    return true

  } catch (error) {
    logger.error('Error updating user subscription', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Retrieves subscription details from Stripe for a given subscription ID
 * Useful for getting current status, next billing date, etc.
 * NOTE: Stripe returns current_period_end/start at items.data[0], not at subscription root
 */
export async function getStripeSubscriptionDetails(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    const expanded = subscription as unknown as StripeSubscriptionExpanded

    return {
      status: expanded.status,
      currentPeriodEnd: getCurrentPeriodEnd(expanded),
      currentPeriodStart: convertStripeTimestamp(getFirstSubscriptionItem(expanded)?.current_period_start || null),
      cancelAtPeriodEnd: expanded.cancel_at_period_end,
      customerId: expanded.customer as string
    }
  } catch (error) {
    logger.error('Error retrieving Stripe subscription', {
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Cancels a Visitor account subscription by BetterAuth user ID.
 * This cancels at period end to honor the paid time
 */
export async function cancelUserSubscription(authUserId: string): Promise<{
  success: boolean
  message: string
  membershipExpiresAt?: string
}> {
  try {
    const payload = await getPayload({ config })

    const profile = await findVisitorProfileByAuthUserId(authUserId)

    if (!profile) {
      return { success: false, message: 'Visitor profile not found' }
    }

    if (!profile.stripeSubscriptionId || profile.subscriptionStatus !== 'active') {
      return { success: false, message: 'No active subscription found' }
    }

    const cancelledSubscription = await stripe.subscriptions.update(profile.stripeSubscriptionId, {
      cancel_at_period_end: true
    }) as unknown as StripeSubscriptionExpanded

    // Calculate when membership will actually expire
    const membershipExpiresAt = getCurrentPeriodEnd(cancelledSubscription)

    await payload.update({
      collection: 'visitor-profiles',
      id: profile.id,
      data: {
        cancelAtPeriodEnd: true,
        membershipExpiration: membershipExpiresAt ? membershipExpiresAt.toISOString() : null
      }
    })

    logger.info('Cancelled subscription', {
      subscriptionId: profile.stripeSubscriptionId,
      expiresAt: membershipExpiresAt?.toISOString() ?? null,
    })

    const subscriptionType = await getSubscriptionProductName(profile.stripeSubscriptionId)

    // Send cancellation email
    try {
      await sendSubscriptionCancelledEmail(payload, {
        email: profile.email,
        firstName: profile.firstName ?? undefined,
        lastName: profile.lastName ?? undefined,
        subscriptionType,
        membershipExpiresAt: membershipExpiresAt || undefined,
        wasImmediate: false // User-initiated cancellations honor paid period
      })
    } catch (error) {
      logger.error('Failed to send cancellation email', {
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't fail the cancellation if email fails
    }

    return {
      success: true,
      message: membershipExpiresAt ? `Subscription cancelled. Access will continue until ${membershipExpiresAt.toLocaleDateString()}` : 'Subscription cancelled',
      membershipExpiresAt: membershipExpiresAt ? membershipExpiresAt.toISOString() : undefined
    }

  } catch (error) {
    logger.error('Error cancelling user subscription', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { success: false, message: 'Failed to cancel subscription' }
  }
}

/**
 * Reactivates a Visitor account subscription.
 * This removes the cancellation flag so the subscription will auto-renew
 */
export async function reactivateUserSubscription(authUserId: string): Promise<{
  success: boolean
  message: string
  renewsAt?: string
}> {
  try {
    const payload = await getPayload({ config })

    const profile = await findVisitorProfileByAuthUserId(authUserId)

    if (!profile) {
      return { success: false, message: 'Visitor profile not found' }
    }

    if (!profile.stripeSubscriptionId) {
      return {
        success: false,
        message: 'Subscription has expired and cannot be reactivated. Please create a new subscription.'
      }
    }

    // Check if subscription is actually cancelled
    if (!profile.cancelAtPeriodEnd) {
      // If subscription is active and not cancelled, no need to reactivate
      if (profile.subscriptionStatus === 'active') {
        return { success: false, message: 'Subscription is already active' }
      }
      // If subscription is in another state (cancelled, past_due), it can't be reactivated
      return {
        success: false,
        message: 'Subscription cannot be reactivated. Please create a new subscription.'
      }
    }

    // Remove the cancellation flag in Stripe
    const updatedSubscription = await stripe.subscriptions.update(profile.stripeSubscriptionId, {
      cancel_at_period_end: false
    }) as unknown as StripeSubscriptionExpanded

    // Get the new renewal date
    const renewsAt = getCurrentPeriodEnd(updatedSubscription)

    if (!renewsAt) {
      return {
        success: false,
        message: 'Failed to get renewal date from Stripe'
      }
    }

    // Update user record to reflect reactivation
    await payload.update({
      collection: 'visitor-profiles',
      id: profile.id,
      data: {
        cancelAtPeriodEnd: false,
        membershipExpiration: null, // Clear expiration since subscription will renew
        subscriptionRenewsAt: renewsAt.toISOString()
      }
    })

    logger.info('Reactivated subscription', {
      subscriptionId: profile.stripeSubscriptionId,
      renewsAt: renewsAt.toISOString(),
    })

    const subscriptionType = await getSubscriptionProductName(profile.stripeSubscriptionId)

    // Send reactivation confirmation email
    try {
      await sendSubscriptionReactivatedEmail(payload, {
        email: profile.email,
        firstName: profile.firstName ?? undefined,
        lastName: profile.lastName ?? undefined,
        subscriptionType,
        renewsAt
      })
    } catch (error) {
      logger.error('Failed to send reactivation email', {
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't fail the reactivation if email fails
    }

    return {
      success: true,
      message: `Subscription reactivated. Will renew on ${renewsAt.toLocaleDateString()}`,
      renewsAt: renewsAt.toISOString()
    }

  } catch (error) {
    logger.error('Error reactivating user subscription', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { success: false, message: 'Failed to reactivate subscription' }
  }
}

/**
 * Maps Stripe subscription status to our internal subscription status
 */
export function mapStripeStatusToInternal(stripeStatus: string): 'active' | 'cancelled' | 'past_due' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'incomplete':
      // Subscription created but payment not completed yet
      // Treat as past_due to indicate action is needed, but not as harsh as a failed payment
      return 'past_due'
    case 'canceled':
    case 'cancelled':
    case 'incomplete_expired':
      return 'cancelled'
    default:
      logger.warn('Unknown Stripe subscription status, defaulting to past_due', { stripeStatus })
      return 'past_due'
  }
}
