import type { CollectionBeforeDeleteHook } from 'payload'
import { cleanupStripeCustomer } from '@/payments/lib/stripe-cleanup'

/**
 * Clean up Stripe data when a user is deleted
 * Cancels any active subscriptions and deletes the customer record
 */
export const beforeDeleteHook: CollectionBeforeDeleteHook = async ({ req, id }) => {
  try {
    // Get the user data before deletion to extract Stripe customer ID
    const userToDelete = await req.payload.findByID({
      collection: 'users',
      id,
      depth: 0
    })

    if (userToDelete?.stripeCustomerId) {
      console.log('Cleaning up Stripe data for user before deletion:', {
        userId: id,
        email: userToDelete.email,
        stripeCustomerId: userToDelete.stripeCustomerId
      })

      // Clean up Stripe customer and subscriptions
      const cleanupResult = await cleanupStripeCustomer(userToDelete.stripeCustomerId)

      if (cleanupResult.success) {
        console.log('Stripe cleanup completed successfully:', {
          subscriptionsCancelled: cleanupResult.subscriptionsCancelled,
          customerDeleted: cleanupResult.customerDeleted
        })
      } else {
        console.warn('Stripe cleanup had issues:', cleanupResult.errors)
      }
    } else {
      console.log('User has no Stripe data to clean up')
    }
  } catch (error) {
    // Don't block user deletion if Stripe cleanup fails
    console.error('Error during Stripe cleanup (user deletion will proceed):', error)
  }
}
