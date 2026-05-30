import type { FieldAccess } from 'payload'
import { getAuthenticatedUser } from '../../lib/get-authenticated-user'

/**
 * Only admins can set or modify the role field
 */
export const isAdminFieldLevel: FieldAccess = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return user?.role === 'admin'
}
