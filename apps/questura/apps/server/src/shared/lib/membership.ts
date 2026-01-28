import type { User } from '@/payload-types'

export function isActiveMember(user: User | null | undefined): boolean {
  if (!user) return false

  // PRIORITY 1: Admin/Editor always active
  if (user.role === 'admin' || user.role === 'editor') {
    return true
  }

  // PRIORITY 2: Active subscription members (auto-renewing)
  if (user.subscriptionStatus === 'active') {
    return true
  }

  // PRIORITY 3: Cancelled/no subscriptions with remaining paid period
  if ((user.subscriptionStatus === 'cancelled' || user.subscriptionStatus === 'none') && user.membershipExpiration) {
    const now = new Date()
    const expiration = new Date(user.membershipExpiration)
    return expiration > now
  }

  return false
}

export function getMembershipStatus(user: User | null | undefined): {
  isActive: boolean
  expiresAt: Date | null
  renewsAt: Date | null
  daysRemaining: number | null
  membershipType: 'admin' | 'subscription' | 'cancelled' | 'none'
} {
  if (!user) {
    return { isActive: false, expiresAt: null, renewsAt: null, daysRemaining: null, membershipType: 'none' }
  }

  const isActive = isActiveMember(user)
  
  // Determine membership type
  let membershipType: 'admin' | 'subscription' | 'cancelled' | 'none' = 'none'

  if (user.role === 'admin' || user.role === 'editor') {
    membershipType = 'admin'
  } else if (user.subscriptionStatus === 'active') {
    membershipType = 'subscription'
  } else if ((user.subscriptionStatus === 'cancelled' || user.subscriptionStatus === 'none') && user.membershipExpiration) {
    membershipType = 'cancelled'
  }
  
  // Calculate renewal date for active subscriptions
  const renewsAt = user.subscriptionRenewsAt ? new Date(user.subscriptionRenewsAt) : null

  // Calculate expiration info for cancelled subscriptions with grace period
  if (user.membershipExpiration) {
    const expiresAt = new Date(user.membershipExpiration)
    const now = new Date()
    const diffTime = expiresAt.getTime() - now.getTime()
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return {
      isActive,
      expiresAt,
      renewsAt,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      membershipType
    }
  }

  // For active subscriptions, admin users, or users without expiration dates
  return { isActive, expiresAt: null, renewsAt, daysRemaining: null, membershipType }
}