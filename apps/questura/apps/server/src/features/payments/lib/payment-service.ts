import { getPayload } from 'payload'
import config from '@/payload.config'
import { stripe } from './stripe'
import { sendSubscriptionCancelledEmail, sendSubscriptionReactivatedEmail } from '@/emails'
import { convertStripeTimestamp, getSubscriptionProductName } from './payment-helpers'
import type { StripeSubscriptionExpanded, UserSubscriptionUpdate } from '../types'

/**
 * Updates a user's subscription information based on their Stripe customer ID
 * This function is used by webhook handlers to sync Stripe events with user records
 */
export async function updateUserSubscription(
  stripeCustomerId: string,
  updates: UserSubscriptionUpdate
): Promise<boolean> {
  try {
    const payload = await getPayload({ config })

    // Find user by Stripe customer ID
    const userResults = await payload.find({
      collection: 'users',
      where: {
        stripeCustomerId: { equals: stripeCustomerId }
      }
    })

    if (userResults.docs.length === 0) {
      console.error('No user found with Stripe customer ID:', stripeCustomerId)
      return false
    }

    const user = userResults.docs[0]

    // GUARD: Skip subscription updates for staff members
    if (user.role === 'admin' || user.role === 'editor') {
      console.log('Skipping subscription update for staff member:', {
        userId: user.id,
        email: user.email,
        role: user.role,
        reason: 'Staff members have permanent access'
      })
      return true // Return success but don't update
    }

    console.log('Found user for subscription update:', {
      userId: user.id,
      email: user.email,
      currentStatus: user.subscriptionStatus
    })

    // Update user record
    await payload.update({
      collection: 'users',
      id: user.id,
      data: updates
    })

    console.log('Successfully updated user subscription:', {
      userId: user.id,
      updates
    })

    return true

  } catch (error) {
    console.error('Error updating user subscription:', error)
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
    console.log('🔄 getStripeSubscriptionDetails called for:', subscriptionId)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    const expanded = subscription as unknown as StripeSubscriptionExpanded

    // CRITICAL: Stripe returns the period dates in the subscription items, not at the root level
    // Access them from subscription.items.data[0].current_period_end/start
    let currentPeriodEnd: number | null = null
    let currentPeriodStart: number | null = null

    if (expanded.items && Array.isArray(expanded.items.data) && expanded.items.data.length > 0) {
      const firstItem = expanded.items.data[0] as any
      currentPeriodEnd = firstItem.current_period_end || null
      currentPeriodStart = firstItem.current_period_start || null
      console.log('📦 Found subscription item timestamps:', {
        currentPeriodEnd,
        currentPeriodStart,
        itemId: firstItem.id
      })
    }

    const result = {
      status: expanded.status,
      currentPeriodEnd: convertStripeTimestamp(currentPeriodEnd),
      currentPeriodStart: convertStripeTimestamp(currentPeriodStart),
      cancelAtPeriodEnd: expanded.cancel_at_period_end,
      customerId: expanded.customer as string
    }
    console.log('✅ Converted result:', {
      currentPeriodEnd: result.currentPeriodEnd,
      currentPeriodStart: result.currentPeriodStart
    })
    return result
  } catch (error) {
    console.error('❌ Error retrieving Stripe subscription:', error)
    return null
  }
}

/**
 * Cancels a user's subscription by their user ID
 * This cancels at period end to honor the paid time
 */
export async function cancelUserSubscription(userId: string): Promise<{
  success: boolean
  message: string
  membershipExpiresAt?: string
}> {
  try {
    const payload = await getPayload({ config })

    // Find user by ID
    const user = await payload.findByID({
      collection: 'users',
      id: userId
    })

    if (!user) {
      return { success: false, message: 'User not found' }
    }

    // GUARD: Staff members cannot have subscriptions cancelled
    if (user.role === 'admin' || user.role === 'editor') {
      console.log('Preventing subscription cancellation for staff member:', {
        userId: user.id,
        email: user.email,
        role: user.role
      })
      return { success: false, message: 'Staff members do not have subscriptions to cancel' }
    }

    if (!user.stripeSubscriptionId || user.subscriptionStatus !== 'active') {
      return { success: false, message: 'No active subscription found' }
    }

    // Cancel the subscription at period end to honor paid time
    const cancelledSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true
    }) as unknown as StripeSubscriptionExpanded

    // Calculate when membership will actually expire (extract from nested items.data[0] location)
    let membershipExpiresAt: Date | null = null
    if (cancelledSubscription.items && Array.isArray(cancelledSubscription.items.data) && cancelledSubscription.items.data.length > 0) {
      const firstItem = cancelledSubscription.items.data[0] as any
      const currentPeriodEnd = firstItem.current_period_end || null
      membershipExpiresAt = convertStripeTimestamp(currentPeriodEnd)
    }

    // Update user record immediately to reflect cancellation in the database
    // This ensures /api/user/me returns fresh data without waiting for webhooks
    await payload.update({
      collection: 'users',
      id: userId,
      data: {
        cancelAtPeriodEnd: true,
        membershipExpiration: membershipExpiresAt ? membershipExpiresAt.toISOString() : null
      }
    })

    console.log('Successfully cancelled subscription:', {
      userId,
      subscriptionId: user.stripeSubscriptionId,
      expiresAt: membershipExpiresAt
    })

    // Get subscription product information for the email
    const subscriptionType = await getSubscriptionProductName(user.stripeSubscriptionId)

    // Send cancellation email
    try {
      await sendSubscriptionCancelledEmail(payload, {
        email: user.email,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        subscriptionType,
        membershipExpiresAt: membershipExpiresAt || undefined,
        wasImmediate: false // User-initiated cancellations honor paid period
      })
    } catch (error) {
      console.error('Failed to send cancellation email:', error)
      // Don't fail the cancellation if email fails
    }

    return {
      success: true,
      message: membershipExpiresAt ? `Subscription cancelled. Access will continue until ${membershipExpiresAt.toLocaleDateString()}` : 'Subscription cancelled',
      membershipExpiresAt: membershipExpiresAt ? membershipExpiresAt.toISOString() : undefined
    }

  } catch (error) {
    console.error('Error cancelling user subscription:', error)
    return { success: false, message: 'Failed to cancel subscription' }
  }
}

/**
 * Reactivates a user's cancelled subscription
 * This removes the cancellation flag so the subscription will auto-renew
 */
export async function reactivateUserSubscription(userId: string): Promise<{
  success: boolean
  message: string
  renewsAt?: string
}> {
  try {
    const payload = await getPayload({ config })

    // Find user by ID
    const user = await payload.findByID({
      collection: 'users',
      id: userId
    })

    if (!user) {
      return { success: false, message: 'User not found' }
    }

    // GUARD: Staff members cannot have subscriptions reactivated
    if (user.role === 'admin' || user.role === 'editor') {
      console.log('Preventing subscription reactivation for staff member:', {
        userId: user.id,
        email: user.email,
        role: user.role
      })
      return { success: false, message: 'Staff members do not have subscriptions' }
    }

    // Check if subscription still exists in Stripe
    if (!user.stripeSubscriptionId) {
      return {
        success: false,
        message: 'Subscription has expired and cannot be reactivated. Please create a new subscription.'
      }
    }

    // Check if subscription is actually cancelled
    if (!user.cancelAtPeriodEnd) {
      // If subscription is active and not cancelled, no need to reactivate
      if (user.subscriptionStatus === 'active') {
        return { success: false, message: 'Subscription is already active' }
      }
      // If subscription is in another state (cancelled, past_due), it can't be reactivated
      return {
        success: false,
        message: 'Subscription cannot be reactivated. Please create a new subscription.'
      }
    }

    // Remove the cancellation flag in Stripe
    const updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: false
    }) as unknown as StripeSubscriptionExpanded

    // Get the new renewal date from the nested items.data[0] location (same as retrieve)
    let renewsAt: Date | null = null
    if (updatedSubscription.items && Array.isArray(updatedSubscription.items.data) && updatedSubscription.items.data.length > 0) {
      const firstItem = updatedSubscription.items.data[0] as any
      const currentPeriodEnd = firstItem.current_period_end || null
      renewsAt = convertStripeTimestamp(currentPeriodEnd)
    }

    if (!renewsAt) {
      return {
        success: false,
        message: 'Failed to get renewal date from Stripe'
      }
    }

    // Update user record to reflect reactivation
    await payload.update({
      collection: 'users',
      id: userId,
      data: {
        cancelAtPeriodEnd: false,
        membershipExpiration: null, // Clear expiration since subscription will renew
        subscriptionRenewsAt: renewsAt.toISOString()
      }
    })

    console.log('Successfully reactivated subscription:', {
      userId,
      subscriptionId: user.stripeSubscriptionId,
      renewsAt: renewsAt.toISOString()
    })

    // Get subscription product information for the email
    const subscriptionType = await getSubscriptionProductName(user.stripeSubscriptionId)

    // Send reactivation confirmation email
    try {
      await sendSubscriptionReactivatedEmail(payload, {
        email: user.email,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        subscriptionType,
        renewsAt
      })
    } catch (error) {
      console.error('Failed to send reactivation email:', error)
      // Don't fail the reactivation if email fails
    }

    return {
      success: true,
      message: `Subscription reactivated. Will renew on ${renewsAt.toLocaleDateString()}`,
      renewsAt: renewsAt.toISOString()
    }

  } catch (error) {
    console.error('Error reactivating user subscription:', error)
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
      console.log('Stripe status incomplete - payment method needed')
      return 'past_due'
    case 'canceled':
    case 'cancelled':
    case 'incomplete_expired':
      return 'cancelled'
    default:
      console.warn('Unknown Stripe status:', stripeStatus, 'defaulting to past_due')
      return 'past_due'
  }
}
