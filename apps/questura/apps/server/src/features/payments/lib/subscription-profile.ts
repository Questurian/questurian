import { logger } from '@/shared/utils/logger'
import {
  findVisitorProfileByAuthUserId,
  findVisitorProfileByStripeCustomerId,
  updateVisitorProfileByAuthUserId,
} from '@/features/visitor-auth/lib/visitor-profile'

/**
 * Find the profile a Stripe event belongs to.
 *
 * The customer id is the normal route, and the only one that works for events
 * Stripe raises on its own (renewals, dunning, portal cancellations). But it is
 * a link the application has to have stored, and storing it can fail: the
 * profile row may be missing when checkout runs, or an admin may clear it
 * later. The visitor then pays and nothing marks them a member, because the
 * lookup silently found nobody.
 *
 * Checkout writes `visitorAuthUserId` into the session and subscription
 * metadata, which survives all of that. Falling back to it turns a lost linkage
 * into a self-repair: the profile is found by the id Stripe carried all along,
 * and the customer is stitched back onto it.
 *
 * Deliberately not a search by email. Matching a payment to a person by address
 * is the failure this whole area exists to prevent — see
 * `payments/lib/customer-linkage.ts`.
 */
export async function resolveProfileForStripeCustomer(
  stripeCustomerId: string,
  fallbackVisitorAuthUserId?: string | null
) {
  const byCustomer = await findVisitorProfileByStripeCustomerId(stripeCustomerId)

  if (byCustomer) return byCustomer

  if (!fallbackVisitorAuthUserId) {
    logger.error('No VisitorProfile for Stripe customer and no metadata to fall back on', {
      stripeCustomerId,
    })
    return null
  }

  const byAuthUser = await findVisitorProfileByAuthUserId(fallbackVisitorAuthUserId)

  if (!byAuthUser) {
    logger.error('No VisitorProfile for Stripe customer or its metadata visitor', {
      stripeCustomerId,
      visitorAuthUserId: fallbackVisitorAuthUserId,
    })
    return null
  }

  // The visitor is already linked to a *different* customer. Repointing them
  // would move their membership onto someone else's billing, which is precisely
  // the mix-up this module refuses to make. Report it instead.
  if (byAuthUser.stripeCustomerId && byAuthUser.stripeCustomerId !== stripeCustomerId) {
    logger.error('Stripe event customer disagrees with the profile linkage; not repointing', {
      stripeCustomerId,
      profileId: byAuthUser.id,
      linkedCustomerId: byAuthUser.stripeCustomerId,
    })
    return null
  }

  try {
    await updateVisitorProfileByAuthUserId(fallbackVisitorAuthUserId, { stripeCustomerId })

    logger.warn('Recovered a lost Stripe linkage from event metadata', {
      stripeCustomerId,
      profileId: byAuthUser.id,
    })
  } catch (error) {
    // `stripe_customer_id` is unique, so a racing writer can claim it first.
    // The profile is still the right one to act on; only the repair failed.
    logger.error('Could not restore the Stripe linkage on the profile', {
      stripeCustomerId,
      profileId: byAuthUser.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return { ...byAuthUser, stripeCustomerId }
}
