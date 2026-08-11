import { Access } from 'payload'
import { getAuthenticatedUser } from '../lib/get-authenticated-user'
import { isActiveStaff } from '../lib/staff-status'

export const isLoggedIn: Access = ({ req }) => {
  return isActiveStaff(getAuthenticatedUser(req))
}
