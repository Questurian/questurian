import { getPayload } from 'payload'
import type Stripe from 'stripe'
import config from '@/payload.config'
import { logger } from '@/shared/utils/logger'
import { stripe } from './stripe'
import { convertStripeTimestamp } from './payment-helpers'
import type { StripeSubscriptionExpanded, UserSubscriptionUpdate } from '../types'
import { resyncSubscription } from './subscription-resync'
import { findVisitorProfileByAuthUserId } from '@/features/visitor-auth/lib/visitor-profile'
import { resolveProfileForStripeCustomer } from './subscription-profile'

/**
 * Stripe states in which a subscription is still live enough to cancel or
 * reactivate. `past_due` is deliberately included: a visitor being dunned is
 * the one most likely to want out, and the old `active`-only guard refused them.
 */
const CANCELLABLE_STRIPE_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
])

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
 *
 * `visitorAuthUserId` comes from the event's own metadata and is only a
 * fallback: it recovers the visitor when the customer linkage was never stored
 * or has since been cleared, which would otherwise leave a paid subscription
 * attached to nobody.
 */
export async function updateUserSubscription(
  stripeCustomerId: string,
  updates: UserSubscriptionUpdate,
  visitorAuthUserId?: string | null
): Promise<boolean> {
  try {
    const payload = await getPayload({ config })

    const profile = await resolveProfileForStripeCustomer(stripeCustomerId, visitorAuthUserId)

    if (!profile) {
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
    const profile = await findVisitorProfileByAuthUserId(authUserId)

    if (!profile) {
      return { success: false, message: 'Visitor profile not found' }
    }

    if (!profile.stripeSubscriptionId) {
      return { success: false, message: 'No subscription found' }
    }

    // Eligibility is Stripe's to judge, not the mirrored enum's. Requiring a
    // local `active` status locked visitors in dunning out of cancelling, which
    // is exactly when someone most wants to stop the retries (ADR-0008).
    const current = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId)

    if (!CANCELLABLE_STRIPE_STATUSES.has(current.status)) {
      return { success: false, message: 'This subscription can no longer be cancelled.' }
    }

    if (current.cancel_at_period_end) {
      return { success: false, message: 'Subscription is already scheduled to cancel.' }
    }

    await stripe.subscriptions.update(profile.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    // Writing state is resync's job; this returns what resync actually wrote so
    // the response is derived truth rather than a local guess.
    const { state } = await resyncSubscription(profile.stripeSubscriptionId)
    const endsAt = state?.paidThroughAt ?? null

    logger.info('Cancelled subscription', {
      subscriptionId: profile.stripeSubscriptionId,
      endsAt,
    })

    return {
      success: true,
      message: endsAt
        ? `Subscription cancelled. Access will continue until ${new Date(endsAt).toLocaleDateString()}`
        : 'Subscription cancelled',
      membershipExpiresAt: endsAt ?? undefined,
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

    const current = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId)

    if (!current.cancel_at_period_end) {
      if (CANCELLABLE_STRIPE_STATUSES.has(current.status)) {
        return { success: false, message: 'Subscription is already active' }
      }
      return {
        success: false,
        message: 'Subscription cannot be reactivated. Please create a new subscription.'
      }
    }

    await stripe.subscriptions.update(profile.stripeSubscriptionId, {
      cancel_at_period_end: false,
    })

    const { state } = await resyncSubscription(profile.stripeSubscriptionId)
    const renewsAt = state?.paidThroughAt ?? null

    logger.info('Reactivated subscription', {
      subscriptionId: profile.stripeSubscriptionId,
      renewsAt,
    })

    return {
      success: true,
      message: renewsAt
        ? `Subscription reactivated. Will renew on ${new Date(renewsAt).toLocaleDateString()}`
        : 'Subscription reactivated',
      renewsAt: renewsAt ?? undefined,
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
