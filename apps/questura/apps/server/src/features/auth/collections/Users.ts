import { CollectionConfig } from 'payload'
import { collectionAccess } from './access/collectionLevel'
import { isBootstrapRequestAuthorized } from '../lib/bootstrap-token'
import { userCollectionHooks } from './hooks'
import { basicFields } from './fields'

/**
 * Users Collection - Main entry point assembling all modular components
 *
 * Structure:
 * - Role (sidebar) - Critical field for access control
 * - Tabs: Basic Info, Activity
 *
 * Field organization by concern:
 * - basicFields: Email, firstName, lastName
 *
 * Public authorship is NOT here: it lives on the Authors collection
 * (ADR-0007), so a byline outlives the account.
 *
 * Access control:
 * - Collection-level access in ./access/collectionLevel.ts
 * - Field-level access in ./access/fieldLevel.ts
 *
 * Hooks organized by lifecycle:
 * - beforeChange: First user promotion, membership status summary computation
 * - beforeDelete: Stripe cleanup for user deletion
 * - afterRead: Membership status overview computation
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    // Keep req.user shallow for performance
    depth: 0,
    // Disable login lockouts
    lockTime: 0,
    maxLoginAttempts: 0,
  },
  admin: {
    useAsTitle: 'email',
    // Editors can only see and edit their own profile
    // The read access filter will automatically show only their record in the list
    hideAPIURL: false,
    preview: () => null,
    defaultColumns: ['email', 'role', 'createdAt', 'updatedAt'],
    // Disable "Create" button for non-admins by checking access control
    // Payload respects create access and hides the button if user lacks permission
    group: 'Core',
  },
  access: collectionAccess,
  endpoints: [],
  hooks: userCollectionHooks,
  fields: [
    // User Role - Critical field kept at top for immediate visibility
    {
      name: 'role',
      type: 'select',
      hasMany: false,
      defaultValue: 'writer', // First user still becomes admin via hook
      required: true,
      saveToJWT: true,
      access: {
        // First user must be admin (no choice), subsequent users follow normal rules.
        // This is a second, independent bootstrap gate: collection-level access
        // guards the create itself, this one guards the `role` field on it, and
        // both must agree or an unauthenticated caller could still set a role.
        create: async ({ req, data }) => {
          try {
            // Check if this is the first user being created (database is empty)
            const result = await req.payload.count({
              collection: 'users',
            })
            const userCount = result.totalDocs

            // If no users exist, allow first user creation (will be forced to
            // admin) — but only for a caller holding the bootstrap token.
            if (userCount === 0) return isBootstrapRequestAuthorized({ req, data })

            // Normal case: only admins can create users with roles
            return req.user?.role === 'admin'
          } catch (error) {
            // If we can't count, use conservative approach (only admins)
            return req.user?.role === 'admin'
          }
        },
        // Roles move in both directions between `writer` and `editor`, so a
        // person can be stepped down without their row being destroyed
        // (ADR-0007). `admin` is deliberately not reachable by update: an admin
        // can be demoted, but no update may grant admin, so a hijacked admin
        // session cannot quietly mint a second one. Creating an admin is still
        // an explicit create.
        update: async ({ req, id, data }) => {
          const user = req.user

          // Only admins can attempt role changes
          if (user?.role !== 'admin') return false

          // Payload types allow undefined here; reject invalid requests early
          if (id === undefined || id === null) return false

          // Admins cannot change their own role. This is also what keeps the
          // last admin in place: demoting an admin requires a second admin.
          if (user?.id === id) return false

          const requestedRole = data?.role
          return requestedRole === 'editor' || requestedRole === 'writer'
        },
      },
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Writer', value: 'writer' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'User role. Admins may move a person between Writer and Editor in either direction. Admin cannot be granted by editing an existing account, and nobody may change their own role.',
      },
    },

    // Account lifecycle. Disabling, not deleting, is how a person leaves:
    // the row, the author slug and every relationship pointing at it survive.
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      hasMany: false,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Disabled', value: 'disabled' },
      ],
      access: {
        // Admin-only, and never your own account — the same safeguard the role
        // field uses to keep a lone admin from locking themselves out.
        update: ({ req, id }) => {
          const user = req.user
          if (user?.role !== 'admin') return false
          if (id === undefined || id === null) return false
          return user.id !== id
        },
      },
      admin: {
        position: 'sidebar',
        description:
          'Disabled accounts cannot sign in, hold no access, and have their live sessions revoked immediately. Their author page and bylines are unaffected.',
      },
    },


    // Main content organized in tabs
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Basic Info',
          fields: basicFields,
        },
        {
          label: 'Activity',
          fields: [
            {
              name: 'createdAt',
              type: 'date',
              admin: {
                readOnly: true,
                description: 'Account creation date',
              },
            },
            {
              name: 'updatedAt',
              type: 'date',
              admin: {
                readOnly: true,
                description: 'Last account update date',
              },
            },
          ],
        },
      ],
    },
  ],
}
