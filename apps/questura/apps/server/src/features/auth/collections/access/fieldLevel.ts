import type { Access, FieldAccess } from 'payload'
import { getAuthenticatedUser } from '../../types'

/**
 * Only admins can set or modify the role field
 */
export const isAdminFieldLevel: FieldAccess = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return user?.role === 'admin'
}

/**
 * Only admins can update the membershipExpiration field directly
 * System updates (webhooks without user context) are also allowed
 */
export const membershipExpirationFieldAccess: FieldAccess = ({ req }) => {
  const user = getAuthenticatedUser(req)

  // Allow admins to update manually
  if (user?.role === 'admin') return true

  // Allow system-level updates (webhooks, API calls without user context)
  // This is needed for Stripe webhooks to update membership
  if (!user) return true

  return false
}
