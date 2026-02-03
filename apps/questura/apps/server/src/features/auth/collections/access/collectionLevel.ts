import type { AccessArgs } from 'payload'
import { isAdmin } from '../../access/isAdmin'

/**
 * Collection-level access control for Users
 * Defines who can create, read, update, delete users
 */
export const collectionAccess = {
  /**
   * Only admins can fully access Users collection
   * Editors and Writers can view the collection but only in read-only mode
   */
  admin: ({ req: { user } }: AccessArgs) =>
    Boolean(user && (user.role === 'admin' || user.role === 'editor' || user.role === 'writer')),

  /**
   * Smart user creation: public signup with restrictions
   * - Allow unauthenticated requests (public signup)
   * - Only admins can create users when logged in
   * - Editors and Writers cannot create users
   */
  create: ({ req }: AccessArgs) => {
    if (!req.user) return true // Public signup allowed
    return req.user.role === 'admin' // Only admins can create users when logged in
  },

  /**
   * Only admins can delete users
   */
  delete: isAdmin,

  /**
   * Admins can read all; editors and writers can only read their own profile
   * Returns a filtered query for editors/writers to automatically show only their own record in list view
   */
  read: ({ req }: AccessArgs) => {
    const user = req.user
    if (!user) return false // Unauthenticated can't read
    if (user.role === 'admin') return true // Admins read all
    
    // Editors and Writers can read, but only their own record
    if (user.role === 'editor' || user.role === 'writer') {
      return {
        id: {
          equals: user.id,
        },
      }
    }
    return false // Regular users can't read Users collection
  },

  /**
   * Admins can update all; editors and writers can only update their own profile
   */
  update: ({ req, id }: AccessArgs) => {
    const user = req.user
    if (!user) return false // Unauthenticated can't update
    if (user.role === 'admin') return true // Admins update all
    
    // Editors and Writers can only update their own record
    if (user.role === 'editor' || user.role === 'writer') {
      return user.id === id
    }
    return false // Regular users can't update in this collection
  },
}
