/**
 * Fields `updateUserSubscription` may set on a visitor profile.
 *
 * Every key here must exist on the `visitor-profiles` collection. Payload
 * silently discards data keys it does not recognise, so a field that outlives
 * its column produces a write that succeeds, logs success, and stores nothing.
 */
export interface UserSubscriptionUpdate {
  stripeSubscriptionId?: string
  subscriptionStatus?: 'none' | 'active' | 'cancelled' | 'past_due'
  cancelAtPeriodEnd?: boolean
  firstName?: string
  lastName?: string
  billingEmail?: string
  affiliateReferralId?: string
  affiliateReferredAt?: string
}

export interface StripeCleanupResult {
  success: boolean
  subscriptionsCancelled: number
  customerDeleted: boolean
  errors: string[]
}
