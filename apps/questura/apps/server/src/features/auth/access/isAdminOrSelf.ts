import { Access } from 'payload'
import { staffUser } from '../lib/staff-user'
import { isDisabledStaff } from '../lib/staff-status'

export const isAdminOrSelf: Access = ({ req }) => {
  const user = staffUser(req.user)

  // Need to be logged in, and not disabled
  if (user && !isDisabledStaff(user)) {
    // If user has role of 'admin'
    if (user.role === 'admin') {
      return true
    }

    // If any other type of user, only provide access to themselves
    return {
      id: {
        equals: user.id,
      },
    }
  }

  // Reject everyone else
  return false
}
