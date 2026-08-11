import { Access, FieldAccess } from 'payload'
import { getAuthenticatedUser } from '../lib/get-authenticated-user'
import { isActiveStaff } from '../lib/staff-status'

export const isAdmin: Access = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return isActiveStaff(user) && user?.role === 'admin'
}

export const isAdminFieldLevel: FieldAccess = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return isActiveStaff(user) && user?.role === 'admin'
}
