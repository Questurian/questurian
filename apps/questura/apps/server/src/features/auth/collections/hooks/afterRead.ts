import type { CollectionAfterReadHook } from 'payload'

/**
 * Compute membershipStatusOverview after reading user data
 * Shows detailed status for users and editors viewing themselves
 * NOT computed for admins (they shouldn't see membership status in Activity tab)
 */
export const afterReadHook: CollectionAfterReadHook = ({ doc }) => {
  if (!doc) return doc

  // Only compute membershipStatusOverview for users and editors
  // Admins don't get this field shown (hidden by field condition)
  if (doc.role === 'admin') {
    return doc
  }

  if (doc.role === 'editor') {
    doc.membershipStatusOverview = `EDITOR - Has Frontend Access`
  } else if (doc.subscriptionStatus === 'active' && !doc.cancelAtPeriodEnd) {
    const renewsAt = doc.subscriptionRenewsAt ? new Date(doc.subscriptionRenewsAt).toLocaleDateString() : 'Unknown'
    doc.membershipStatusOverview = `ACTIVE - Renews ${renewsAt}`
  } else if (doc.subscriptionStatus === 'active' && doc.cancelAtPeriodEnd && doc.membershipExpiration) {
    const expiration = new Date(doc.membershipExpiration)
    const now = new Date()
    const daysLeft = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    doc.membershipStatusOverview = `ENDING - ${daysLeft} days left (${expiration.toLocaleDateString()})`
  } else if ((doc.subscriptionStatus === 'cancelled' || doc.subscriptionStatus === 'none') && doc.membershipExpiration) {
    const expiration = new Date(doc.membershipExpiration)
    const now = new Date()
    if (expiration > now) {
      const daysLeft = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      doc.membershipStatusOverview = `CANCELLED - ${daysLeft} days left (${expiration.toLocaleDateString()})`
    } else {
      doc.membershipStatusOverview = `EXPIRED - Ended ${expiration.toLocaleDateString()}`
    }
  } else if (doc.subscriptionStatus === 'past_due') {
    doc.membershipStatusOverview = `PAST DUE - Payment Failed`
  } else {
    doc.membershipStatusOverview = `INACTIVE - No active subscription`
  }

  return doc
}
