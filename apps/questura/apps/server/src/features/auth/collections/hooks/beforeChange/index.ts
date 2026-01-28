import type { CollectionBeforeChangeHook } from 'payload'
import { firstUserPromotionHook } from './firstUserPromotion'
import { membershipStatusSummaryHook } from './membershipStatusSummary'

/**
 * All beforeChange hooks for Users collection
 * Note: Field-specific hooks (subscriptionStatus, membershipExpiration, cancelAtPeriodEnd)
 * are defined inline in their respective field modules for co-location and clarity
 */
export const beforeChangeHooks: CollectionBeforeChangeHook[] = [
  firstUserPromotionHook,
  membershipStatusSummaryHook
]
