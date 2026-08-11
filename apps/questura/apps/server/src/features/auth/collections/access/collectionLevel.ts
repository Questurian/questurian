import type { AccessArgs } from 'payload'
import { isAdmin } from '../../access/isAdmin'
import { isBootstrapRequestAuthorized } from '../../lib/bootstrap-token'

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
   * Staff creation only.
   *
   * The only unauthenticated create path is first-user bootstrap for fresh
   * environments, and it additionally requires the bootstrap token — an empty
   * collection alone is not authorisation. Public Visitor signup is owned by
   * BetterAuth, not Payload Users.
   */
  create: async ({ req, data }: AccessArgs) => {
    if (req.user) return req.user.role === 'admin'

    // Checked before the count so an unauthorised caller cannot use this
    // endpoint to probe whether the instance has been bootstrapped yet.
    if (!isBootstrapRequestAuthorized({ req, data })) return false

    try {
      const existingUsersCount = await req.payload.count({
        collection: 'users',
      })

      return existingUsersCount.totalDocs === 0
    } catch (error) {
      console.error('Error checking first-user bootstrap access:', error)
      return false
    }
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
