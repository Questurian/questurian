import type Stripe from 'stripe'
import { getStripeSubscriptionDetails } from '@/payments/lib/payment-service'
import { convertStripeTimestamp } from '@/payments/lib/payment-helpers'
import type { StripeSubscriptionExpanded } from '@/payments/types'
import { logger } from '@/shared/utils/logger'

/**
 * Resolve the subscription's current period end as an ISO string, preferring
 * the timestamp on the webhook payload and falling back to the Stripe API
 * when the payload doesn't carry a usable value.
 */
export async function resolveRenewalDate(subscription: Stripe.Subscription): Promise<string | null> {
  const expandedSubscription = subscription as StripeSubscriptionExpanded

  if (expandedSubscription.current_period_end) {
    const convertedDate = convertStripeTimestamp(expandedSubscription.current_period_end)
    if (convertedDate) {
      return convertedDate.toISOString()
    }
  }

  try {
    const subscriptionDetails = await getStripeSubscriptionDetails(subscription.id)
    if (subscriptionDetails?.currentPeriodEnd) {
      return subscriptionDetails.currentPeriodEnd.toISOString()
    }
  } catch (error) {
    logger.error('Error fetching subscription details from Stripe', {
      subscriptionId: subscription.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return null
}
