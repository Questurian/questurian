import { CollectionConfig } from 'payload'
import { collectionAccess } from './access/collectionLevel'
import { userCollectionHooks } from './hooks'
import { basicFields, profileFields } from './fields'

/**
 * Users Collection - Main entry point assembling all modular components
 *
 * Structure:
 * - Role (sidebar) - Critical field for access control
 * - Tabs: Basic Info, Activity, Public Profile
 *
 * Field organization by concern:
 * - basicFields: Email, firstName, lastName
 * - profileFields: Public profile visible to website visitors (editor-only)
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
        // First user must be admin (no choice), subsequent users follow normal rules
        create: async ({ req }) => {
          try {
            // Check if this is the first user being created (database is empty)
            const result = await req.payload.count({
              collection: 'users',
            })
            const userCount = result.totalDocs

            // If no users exist, allow first user creation (will be forced to admin)
            if (userCount === 0) return true

            // Normal case: only admins can create users with roles
            return req.user?.role === 'admin'
          } catch (error) {
            // If we can't count, use conservative approach (only admins)
            return req.user?.role === 'admin'
          }
        },
        // ROLES ARE PERMANENT - No transfers or changes allowed
        // Once assigned, a role cannot be changed. This prevents:
        // - Accidental Admin promotion
        // - Editors gaining frontend access as admin
        // - Role mutations after creation
        //
        // Exception: Allow Writer → Editor promotion (one-time upgrade)
        update: async ({ req, id, data }) => {
          const user = req.user

          // Only admins can attempt role changes
          if (user?.role !== 'admin') return false

          // Payload types allow undefined here; reject invalid requests early
          if (id === undefined || id === null) return false

          // Admins cannot change their own role
          if (user?.id === id) return false

          const requestedRole = data?.role
          if (requestedRole !== 'editor') return false

          // Allow Writer → Editor promotion only
          try {
            const targetUser = await req.payload.findByID({
              collection: 'users',
              id,
              depth: 0,
            })
            // Allow Writer to be promoted to Editor (one-time)
            if (targetUser?.role === 'writer') {
              return true
            }
          } catch (error) {
            return false
          }

          // NO other role changes - all roles are permanent and final
          return false
        },
      },
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Writer', value: 'writer' },
      ],
      admin: {
        position: 'sidebar',
        description: 'User role - assigned once at creation and cannot be changed. Exception: Writers can be promoted to Editor by admins. All other roles are permanent.',
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
        {
          label: 'Public Profile',
          fields: profileFields,
          admin: {
            condition: (data) => data?.role === 'editor',
          },
        },
      ],
    },
  ],
}
