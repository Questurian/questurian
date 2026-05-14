import { Access } from 'payload'
import { getAuthenticatedUser } from '../lib/get-authenticated-user'

export const isLoggedIn: Access = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return Boolean(user)
}
