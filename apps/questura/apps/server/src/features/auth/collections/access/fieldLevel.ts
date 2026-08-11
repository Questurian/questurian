import type { FieldAccess } from 'payload'
import { getAuthenticatedUser } from '../../lib/get-authenticated-user'
import { isActiveStaff } from '../../lib/staff-status'

/**
 * Only active admins can set or modify the role field
 */
export const isAdminFieldLevel: FieldAccess = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return isActiveStaff(user) && user?.role === 'admin'
}
