import type { CollectionConfig } from 'payload'
import { staffUser } from '@/features/auth/lib/staff-user'
import { BOOKMARK_TARGET_TYPES } from '../lib/target'

/**
 * A Bookmark is a private reader marker (ADR-0010).
 *
 * Everything about this collection is shaped by two facts from that ADR.
 *
 * It is *not* on `VisitorProfiles`. That document is the paywall — entitlement
 * is `isFuture(paidThroughAt)` and nothing else — and a bookmark click has no
 * business writing to the billing record. An array field there would also have
 * no uniqueness constraint and would lose writes to read-modify-write races.
 *
 * It is keyed by the Better Auth user id off the Visitor session rather than by
 * a `visitor-profiles` relationship, so bookmarking cannot fail because a
 * profile row has not been lazily created yet. The two lifecycles stay
 * independent.
 *
 * A reader's bookmark list is personal data with no support use: it decides
 * nothing about billing, entitlement or delivery. It is readable by admins for
 * incident forensics and is not browsable.
 */
export const Bookmarks: CollectionConfig = {
  slug: 'bookmarks',
  labels: {
    singular: 'Bookmark',
    plural: 'Bookmarks',
  },
  admin: {
    useAsTitle: 'targetType',
    defaultColumns: ['authUserId', 'targetType', 'targetId', 'createdAt'],
    group: 'Core',
    hidden: ({ user }) => user?.collection !== 'users' || user?.role !== 'admin',
    description:
      'Private reader bookmarks. Present for incident forensics only — not a support surface.',
  },
  access: {
    read: ({ req }) => Boolean(req.user && staffUser(req.user)?.role === 'admin'),
    // Every write is a Local API call from `/api/account/bookmarks` with
    // `overrideAccess: true`, on behalf of the Visitor who owns the row. There
    // is no admin-authored bookmark, and a staff-authored one would be a row
    // the reader never asked for.
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  timestamps: true,
  fields: [
    {
      name: 'authUserId',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Better Auth user id of the Visitor account that owns this bookmark.',
      },
    },
    {
      name: 'targetType',
      type: 'select',
      required: true,
      index: true,
      // These are `ArticleTypeKey` values, not collection slugs, so
      // `TYPE_TO_COLLECTION` stays the single mapping and admitting a new
      // Bookmark target later is one option plus a migration.
      options: BOOKMARK_TARGET_TYPES.map((value) => ({ label: value, value })),
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'targetId',
      type: 'number',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'Document id in the target collection. Stored as a reference, never a snapshot: title, image and href are resolved live on read.',
      },
    },
  ],
  indexes: [
    {
      // One row per visitor per target. Payload cannot declare a composite
      // unique on its own; without this a double-click writes two rows.
      fields: ['authUserId', 'targetType', 'targetId'],
      unique: true,
    },
  ],
}
