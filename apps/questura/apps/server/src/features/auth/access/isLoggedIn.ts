import { Access } from 'payload'
import { getAuthenticatedUser } from '../types'

export const isLoggedIn: Access = ({ req }) => {
  const user = getAuthenticatedUser(req)
  return Boolean(user)
}
