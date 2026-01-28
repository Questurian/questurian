import { getPayload } from 'payload'
import config from '@/payload.config'
import { stripe } from './stripe'
import type Stripe from 'stripe'
import type { StripePriceWithProduct } from '../types'

/**
 * Converts Stripe Unix timestamp to JavaScript Date
 * Returns null for invalid/missing timestamps
 */
export function convertStripeTimestamp(timestamp: number | null | undefined): Date | null {
  // Log raw input for debugging
  console.log('🔄 convertStripeTimestamp input:', { timestamp, type: typeof timestamp })

  // Validate input
  if (timestamp === null || timestamp === undefined) {
    console.warn('⚠️ convertStripeTimestamp received null/undefined timestamp')
    return null
  }

  // Stripe timestamps should be positive integers
  if (typeof timestamp !== 'number' || timestamp <= 0) {
    console.warn('⚠️ convertStripeTimestamp received invalid timestamp:', timestamp)
    return null
  }

  try {
    const date = new Date(timestamp * 1000)

    // Validate that the resulting date is valid
    if (isNaN(date.getTime())) {
      console.warn('⚠️ convertStripeTimestamp resulted in invalid Date:', timestamp)
      return null
    }

    return date
  } catch (error) {
    console.error('❌ Error converting Stripe timestamp:', timestamp, error)
    return null
  }
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
    console.error('Error fetching subscription product name:', error)
    return 'Premium Membership'
  }
}

/**
 * Finds a user by their Stripe customer ID
 * Returns null if no user is found
 */
export async function getUserByStripeCustomerId(customerId: string) {
  try {
    const payload = await getPayload({ config })

    const userResults = await payload.find({
      collection: 'users',
      where: {
        stripeCustomerId: { equals: customerId }
      },
      limit: 1
    })

    if (userResults.docs.length === 0) {
      console.error('No user found with Stripe customer ID:', customerId)
      return null
    }

    return userResults.docs[0]
  } catch (error) {
    console.error('Error finding user by Stripe customer ID:', error)
    return null
  }
}
