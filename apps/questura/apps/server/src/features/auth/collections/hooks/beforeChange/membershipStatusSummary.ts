import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Compute membershipStatusSummary based on role and subscription status
 * For admin/editor: always returns role name
 * For users: returns subscription status
 *
 * Helper function that returns the computed value
 */
const computeMembershipStatusSummary = (data: any, originalDoc: any) => {
  const user = { ...originalDoc, ...data }

  // Staff members always have the same summary
  if (user.role === 'admin' || user.role === 'editor') {
    const summary = user.role?.toUpperCase()
    if (data?.membershipStatusSummary && data.membershipStatusSummary !== summary) {
      console.log('Preventing membershipStatusSummary change for staff member:', {
        userId: originalDoc?.id,
        email: originalDoc?.email,
        role: user.role,
        attemptedValue: data.membershipStatusSummary
      })
    }
    return summary
  }

  // Only calculate if membership fields changed for regular users
  const membershipFields = ['role', 'subscriptionStatus', 'subscriptionRenewsAt', 'membershipExpiration']
  const hasRelevantChanges = membershipFields.some(field =>
    data && data[field] !== originalDoc?.[field]
  )

  if (!hasRelevantChanges && originalDoc?.membershipStatusSummary) {
    return originalDoc.membershipStatusSummary
  }

  if (user.subscriptionStatus === 'active') {
    return 'ACTIVE'
  } else if ((user.subscriptionStatus === 'cancelled' || user.subscriptionStatus === 'none') && user.membershipExpiration) {
    const expiration = new Date(user.membershipExpiration)
    const now = new Date()
    if (expiration > now) {
      const daysLeft = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return `ENDING (${daysLeft} days)`
    }
  }

  return 'INACTIVE'
}

/**
 * Payload collection hook that wraps the computation
 */
export const membershipStatusSummaryHook: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  data.membershipStatusSummary = computeMembershipStatusSummary(data, originalDoc)
  return data
}
