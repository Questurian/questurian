import type { CollectionAfterChangeHook } from 'payload'

import { isDisabledStaff } from '../../../lib/staff-status'

/**
 * Revokes every live session the moment an account is disabled (ADR-0007).
 *
 * This is what makes `disabled` mean "holds no access" rather than "holds no
 * access in the places that remembered to check". Payload's JWT strategy
 * re-reads the user row on every request and rejects a token whose `sid` is no
 * longer in `sessions`, so emptying that array invalidates outstanding tokens
 * everywhere at once — including the collections whose access functions test
 * only `role`.
 *
 * Written through `db.updateOne` with the full document, which is the same
 * path Payload's own logout uses: the `sessions` field declares
 * `access.update: () => false`, so it cannot be cleared by mutating `data` in
 * a `beforeChange` hook, and a nested `payload.update` would re-enter this
 * collection's hooks.
 */
export const revokeSessionsOnDisableHook: CollectionAfterChangeHook = async ({
  collection,
  doc,
  req,
}) => {
  if (!isDisabledStaff(doc as { status?: string | null })) return doc

  // `sessions` and `updatedAt` are added to the row by Payload's auth field
  // set rather than by the collection config, so they are absent from the
  // adapter's `TypeWithID` return type.
  const userWithSessions = (await req.payload.db.findOne({
    collection: collection.slug,
    req,
    where: { id: { equals: doc.id } },
  })) as ({ sessions?: unknown[]; updatedAt?: string | null } & Record<string, unknown>) | null

  if (!userWithSessions?.sessions?.length) return doc

  userWithSessions.sessions = []
  // Clearing a session is not a content edit; keep updatedAt where it was.
  userWithSessions.updatedAt = null

  await req.payload.db.updateOne({
    id: doc.id,
    collection: collection.slug,
    data: userWithSessions,
    req,
    returning: false,
  })

  return doc
}
