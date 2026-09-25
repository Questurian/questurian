import type Stripe from 'stripe'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { logger } from '@/shared/utils/logger'
import { withAdvisoryLock } from '@/shared/utils/advisory-lock'
import { customerLockKey } from '@/payments/lib/subscription-lock'
import { findVisitorProfileByStripeCustomerId } from '@/features/visitor-auth/lib/visitor-profile'

/**
 * A customer deleted in Stripe (by hand, in the Dashboard).
 *
 * The profile used to keep pointing at it. Checkout reuses the stored customer
 * and the portal opens a session on it, and Stripe refuses both for a deleted
 * customer, so that visitor got a 500 from each, forever. Clearing the link
 * lets the next checkout resolve a fresh customer.
 *
 * Membership is left to the subscription events: Stripe cancels the
 * customer's subscriptions as it deletes it, and `customer.subscription.deleted`
 * decides what paid time remains, as for any other cancellation. That event may
 * arrive after this one; `resolveProfileForStripeCustomer` refuses to stitch a
 * deleted customer back on.
 *
 * Under the customer's lock, the same one resync takes, so the two cannot
 * interleave their reads and writes of this row.
 */
export async function handleCustomerDeleted(customer: Stripe.Customer | Stripe.DeletedCustomer) {
  logger.info('Processing customer.deleted', { customerId: customer.id })

  const payload = await getPayload({ config })

  await withAdvisoryLock(payload, customerLockKey(customer.id), async () => {
    const profile = await findVisitorProfileByStripeCustomerId(customer.id)

    // Not ours (a customer created in the Dashboard, or one already cleared):
    // nothing to correct, and a retry would not change that.
    if (!profile) {
      logger.info('customer.deleted for a customer no profile points at', { customerId: customer.id })
      return
    }

    await payload.update({
      collection: 'visitor-profiles',
      id: profile.id,
      data: { stripeCustomerId: null },
      overrideAccess: true,
    })

    logger.warn('Cleared a deleted Stripe customer from its profile', {
      customerId: customer.id,
      profileId: profile.id,
    })
  })
}
