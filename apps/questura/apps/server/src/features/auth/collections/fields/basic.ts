import type { Field } from 'payload'

export const basicFields: Field[] = [
  {
    name: 'email',
    type: 'email',
    required: true,
    unique: true,
    validate: async (val: string | null | undefined, { req, operation, data }) => {
      if (!val) return 'Email is required'

      // Normalize email: trim whitespace and convert to lowercase
      const email = val.trim().toLowerCase()

      // Check email length (RFC 5321 max is 254 characters)
      if (email.length > 254) {
        return 'Email address is too long (maximum 254 characters)'
      }

      // Improved email regex (more RFC-compliant)
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
      if (!emailRegex.test(email)) {
        return 'Please enter a valid email address'
      }

      // Update the data with normalized email
      if (data) {
        (data as any).email = email
      }

      // STAFF EMAIL DOMAIN VALIDATION
      // Staff accounts (editor/admin) must use company email (@questurian.com)
      // Exception: allow first-user bootstrap (auto-promoted to admin) to use any email.
      const userRole = (data as any)?.role
      let isFirstUserBootstrap = false
      if (operation === 'create' && !req?.user && req?.payload) {
        try {
          const existingUsersCount = await req.payload.count({
            collection: 'users',
          })
          isFirstUserBootstrap = existingUsersCount.totalDocs === 0
        } catch (error) {
          console.error('Error checking first-user bootstrap state:', error)
        }
      }

      if (userRole === 'editor' || userRole === 'admin') {
        if (!isFirstUserBootstrap && !email.endsWith('@questurian.com')) {
          return 'Staff accounts must use company email (@questurian.com). Please use your Questurian staff email address.'
        }
      }

      // Only check for OAuth conflicts during local account creation
      if (operation === 'create' && req?.payload) {
        try {
          const existingUsers = await req.payload.find({
            collection: 'users',
            where: {
              email: { equals: email }
            }
          })

          if (existingUsers.docs.length > 0) {
            const existingUser = existingUsers.docs[0]

            // SECURITY: Block admin/editor accounts from frontend signup
            if (existingUser.role === 'admin' || existingUser.role === 'editor') {
              return 'This email is associated with an admin account. Admin accounts cannot be created through public signup.'
            }

            if (existingUser.authProvider === 'google') {
              return 'This email is associated with a Google account. Please sign in with Google instead.'
            }
          }
        } catch (error) {
          // If validation check fails, allow creation to proceed
          console.error('Error checking for existing OAuth account:', error)
        }
      }

      return true
    },
    admin: {
      description: "Primary email address for account login and communications",
    },
  },
  {
    type: 'row',
    fields: [
      {
        name: 'firstName',
        type: 'text',
        required: false,
        admin: {
          description: 'First name (optional during signup, can be added later for subscriptions)'
        }
      },
      {
        name: 'lastName',
        type: 'text',
        required: false,
        admin: {
          description: 'Last name (optional during signup, can be added later for subscriptions)'
        }
      },
    ],
  },
]
