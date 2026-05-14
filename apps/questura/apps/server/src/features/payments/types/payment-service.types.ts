export interface UserSubscriptionUpdate {
  stripeSubscriptionId?: string
  subscriptionStatus?: 'none' | 'active' | 'cancelled' | 'past_due'
  membershipExpiration?: string | null
  subscriptionRenewsAt?: string | null
  cancelAtPeriodEnd?: boolean
}

export interface StripeCleanupResult {
  success: boolean
  subscriptionsCancelled: number
  customerDeleted: boolean
  errors: string[]
}
