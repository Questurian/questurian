import type { AccessArgs, CollectionConfig } from 'payload'

import { isDisabledStaff } from '../lib/staff-status'
import { generateApiKeyHook } from './hooks/beforeOperation/generateApiKey'

/**
 * Machine identity, kept out of `Users` (ADR-0006).
 *
 * A service account has no `role` enum and no authorship, so it cannot appear
 * in the staff list, cannot be given a public `/authors/<slug>` page, and
 * cannot be counted as staff by `isStaffEmail` -- not because each of those
 * queries remembers to exclude it, but because the fields and hooks that would
 * produce those behaviours do not exist on this collection.
 *
 * `disableLocalStrategy` removes the email and password fields outright. A
 * long-lived shared password that cannot be rotated or scoped is the thing
 * this collection exists to remove, so there is no password to leave behind.
 * Rotation is issuing a new key; revocation is unchecking `enableAPIKey` or
 * deleting the row, and neither touches a human's login.
 */

/**
 * Only an active human admin. Checking `collection` matters as much as the
 * role: a service account has no `role` field, so `user.role === 'admin'`
 * would already be false for one, but relying on the absence of a field is a
 * weaker statement than naming who is allowed.
 */
function isHumanAdmin({ req: { user } }: AccessArgs): boolean {
  if (!user) return false
  if (user.collection !== 'users') return false
  if (isDisabledStaff(user)) return false
  return user.role === 'admin'
}

export const ServiceAccounts: CollectionConfig = {
  slug: 'service-accounts',
  labels: {
    singular: 'Service Account',
    plural: 'Service Accounts',
  },
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true,
    depth: 0,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'enableAPIKey', 'updatedAt'],
    group: 'Core',
    description:
      'API-key identities for machine callers. Never a person; never appears on the public site.',
    hidden: ({ user }) => user?.collection !== 'users' || user?.role !== 'admin',
  },
  access: {
    // Default-deny, admin-managed. A service account cannot read, create,
    // update or delete service accounts -- including itself -- so holding one
    // key is never a route to minting or reading another.
    admin: isHumanAdmin,
    read: isHumanAdmin,
    create: isHumanAdmin,
    update: isHumanAdmin,
    delete: isHumanAdmin,
  },
  hooks: {
    beforeOperation: [generateApiKeyHook],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Which system this key belongs to, e.g. "Location Manager".',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description:
          'What this account is allowed to do and why it exists. Grants are explicit collection access, not an inherited role, so this is the note that explains them.',
      },
    },
  ],
}
