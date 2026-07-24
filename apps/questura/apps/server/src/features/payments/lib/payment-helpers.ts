import { stripe } from './stripe'
import type { StripePriceWithProduct } from '../types'
import { logger } from '@/shared/utils/logger'

/**
 * Converts Stripe Unix timestamp to JavaScript Date
 * Returns null for invalid/missing timestamps
 */
export function convertStripeTimestamp(timestamp: number | null | undefined): Date | null {
  if (timestamp === null || timestamp === undefined) {
    return null
  }

  // Stripe timestamps should be positive integers
  if (typeof timestamp !== 'number' || timestamp <= 0) {
    logger.warn('convertStripeTimestamp received invalid timestamp', { timestamp })
    return null
  }

  const date = new Date(timestamp * 1000)

  // Validate that the resulting date is valid
  if (isNaN(date.getTime())) {
    logger.warn('convertStripeTimestamp resulted in invalid Date', { timestamp })
    return null
  }

  return date
}

/**
 * Retrieves the product name from a subscription
 * Returns 'Premium Membership' as default if not found
 */
export async function getSubscriptionProductName(subscriptionId: string): Promise<string> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product']
    })

    if (subscription.items.data.length > 0) {
      const price = subscription.items.data[0].price as StripePriceWithProduct
      if (price.product && typeof price.product === 'object' && price.product.name) {
        return price.product.name
      }
    }

    return 'Premium Membership'
  } catch (error) {
    logger.error('Error fetching subscription product name', {
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return 'Premium Membership'
  }
}
