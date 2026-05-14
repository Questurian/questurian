import { Access, FieldAccess } from 'payload'
import { getAuthenticatedUser } from '../lib/get-authenticated-user'

export const isAdmin: Access = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return user?.role === 'admin'
}

export const isAdminFieldLevel: FieldAccess = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return user?.role === 'admin'
}

