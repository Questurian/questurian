import { stripe } from './stripe'

export interface StripeCleanupResult {
  success: boolean
  subscriptionsCancelled: number
  customerDeleted: boolean
  errors: string[]
}

/**
 * Safely clean up all Stripe data for a user in development environment
 * This function cancels active subscriptions and deletes the customer
 *
 * @param stripeCustomerId - The Stripe customer ID to clean up
 * @returns Cleanup result with success status and details
 */
export async function cleanupStripeCustomer(stripeCustomerId: string): Promise<StripeCleanupResult> {
  const result: StripeCleanupResult = {
    success: false,
    subscriptionsCancelled: 0,
    customerDeleted: false,
    errors: []
  }

  if (!stripeCustomerId) {
    result.errors.push('No Stripe customer ID provided')
    return result
  }

  console.log('🧹 Starting Stripe cleanup for customer:', stripeCustomerId)

  try {
    // Step 1: Get and cancel all active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active'
    })

    console.log(`📋 Found ${subscriptions.data.length} active subscriptions to cancel`)

    // Cancel each active subscription
    for (const subscription of subscriptions.data) {
      try {
        await stripe.subscriptions.cancel(subscription.id)
        result.subscriptionsCancelled++
        console.log(`✅ Cancelled subscription: ${subscription.id}`)
      } catch (error) {
        const errorMsg = `Failed to cancel subscription ${subscription.id}: ${error}`
        result.errors.push(errorMsg)
        console.error('❌', errorMsg)
      }
    }

    // Step 2: Delete the customer
    try {
      await stripe.customers.del(stripeCustomerId)
      result.customerDeleted = true
      console.log(`✅ Deleted Stripe customer: ${stripeCustomerId}`)
    } catch (error) {
      const errorMsg = `Failed to delete customer ${stripeCustomerId}: ${error}`
      result.errors.push(errorMsg)
      console.error('❌', errorMsg)
    }

    // Mark as successful if customer was deleted (subscriptions are optional)
    result.success = result.customerDeleted

    console.log('🎉 Stripe cleanup completed:', {
      subscriptionsCancelled: result.subscriptionsCancelled,
      customerDeleted: result.customerDeleted,
      errors: result.errors.length
    })

  } catch (error) {
    const errorMsg = `Stripe cleanup failed: ${error}`
    result.errors.push(errorMsg)
    console.error('❌ Stripe cleanup error:', error)
  }

  return result
}
