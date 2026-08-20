import { getPayload } from 'payload'
import type { Where } from 'payload'

import config from '@/payload.config'
import { serializeIndexItem, type IndexItem } from '@/features/articles/public/indexItem'
import { isAccessTier, DEFAULT_ACCESS_TIER, type AccessTier } from '@/shared/content/accessTier'
import {
  BOOKMARK_TARGET_TYPES,
  bookmarkTargetCollection,
  type BookmarkTargetType,
} from './target'

export type BookmarkRef = {
  targetType: BookmarkTargetType
  targetId: number
}

export type BookmarkListItem = IndexItem & {
  targetType: BookmarkTargetType
  /** Access tier of the target, so the list can mark what the reader cannot yet read. */
  access: AccessTier
  bookmarkedAt: string
}

export type BookmarkListPage = {
  page: number
  pageSize: number
  /** Bookmark rows held, including any whose target is currently unavailable. */
  totalDocs: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  items: BookmarkListItem[]
}

/**
 * `items` can be shorter than the bookmark rows on the page, and that is the
 * design rather than a bug: a target that is unpublished or deleted is omitted
 * silently, with no placeholder (ADR-0010). Counts describe rows held, so they
 * stay stable while an editor works on an article.
 */

const MAX_PAGE_SIZE = 50

export async function listBookmarkRefs(authUserId: string): Promise<BookmarkRef[]> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'bookmarks',
    where: { authUserId: { equals: authUserId } },
    // A reader's own list, bounded so a pathological account cannot turn the
    // "is this bookmarked" check on a card grid into an unbounded read.
    limit: 1000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  return result.docs.flatMap((doc) => {
    const targetType = doc.targetType as BookmarkTargetType
    const targetId = Number(doc.targetId)
    if (!Number.isInteger(targetId)) return []
    return [{ targetType, targetId }]
  })
}

export async function isBookmarked(authUserId: string, ref: BookmarkRef): Promise<boolean> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'bookmarks',
    where: {
      and: [
        { authUserId: { equals: authUserId } },
        { targetType: { equals: ref.targetType } },
        { targetId: { equals: ref.targetId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return result.docs.length > 0
}

/**
 * Refuses a bookmark on a target that is not currently published, so the list
 * cannot be seeded with ids the reader was never shown. Existing bookmarks are
 * not re-checked on read for availability beyond the same published gate.
 */
export async function targetExists(ref: BookmarkRef): Promise<boolean> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: bookmarkTargetCollection(ref.targetType),
    where: {
      and: [{ id: { equals: ref.targetId } }, { status: { equals: 'published' } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return result.docs.length > 0
}

export async function addBookmark(authUserId: string, ref: BookmarkRef): Promise<void> {
  const payload = await getPayload({ config })
  try {
    await payload.create({
      collection: 'bookmarks',
      data: { authUserId, targetType: ref.targetType, targetId: ref.targetId },
      overrideAccess: true,
    })
  } catch (error) {
    // The compound unique index is the real guard against a double-click, so a
    // duplicate reaching here means the visitor already holds this bookmark.
    // That is the state they asked for; report success rather than an error.
    if (await isBookmarked(authUserId, ref)) return
    throw error
  }
}

export async function removeBookmark(authUserId: string, ref: BookmarkRef): Promise<void> {
  const payload = await getPayload({ config })
  await payload.delete({
    collection: 'bookmarks',
    where: {
      and: [
        { authUserId: { equals: authUserId } },
        { targetType: { equals: ref.targetType } },
        { targetId: { equals: ref.targetId } },
      ],
    },
    overrideAccess: true,
  })
}

function readAccessTier(doc: Record<string, unknown>): AccessTier {
  const value = doc.access
  return isAccessTier(value) ? value : DEFAULT_ACCESS_TIER
}

export async function listBookmarkPage(options: {
  authUserId: string
  page: number
  pageSize: number
  targetType?: BookmarkTargetType
}): Promise<BookmarkListPage> {
  const payload = await getPayload({ config })
  const page = Math.max(1, Math.floor(options.page) || 1)
  const pageSize = Math.min(Math.max(1, Math.floor(options.pageSize) || 20), MAX_PAGE_SIZE)

  const where: Where = options.targetType
    ? {
        and: [
          { authUserId: { equals: options.authUserId } },
          { targetType: { equals: options.targetType } },
        ],
      }
    : { authUserId: { equals: options.authUserId } }

  const rows = await payload.find({
    collection: 'bookmarks',
    where,
    page,
    limit: pageSize,
    depth: 0,
    // Most recently bookmarked first: the list is a queue of intent, not an
    // archive ordered by when the article happened to be published.
    sort: '-createdAt',
    overrideAccess: true,
  })

  const byType = new Map<BookmarkTargetType, number[]>()
  const bookmarkedAt = new Map<string, string>()
  for (const row of rows.docs) {
    const targetType = row.targetType as BookmarkTargetType
    const targetId = Number(row.targetId)
    if (!Number.isInteger(targetId)) continue
    byType.set(targetType, [...(byType.get(targetType) ?? []), targetId])
    bookmarkedAt.set(`${targetType}:${targetId}`, String(row.createdAt))
  }

  const resolved = new Map<string, BookmarkListItem>()

  await Promise.all(
    [...byType.entries()].map(async ([targetType, ids]) => {
      const result = await payload.find({
        collection: bookmarkTargetCollection(targetType),
        where: {
          and: [
            { id: { in: ids } },
            // Same published gate the public article index uses. One
            // definition of publicly visible, not two (ADR-0010).
            { status: { equals: 'published' } },
          ],
        },
        limit: ids.length,
        depth: 1,
        overrideAccess: true,
      })

      for (const doc of result.docs) {
        const record = doc as unknown as Record<string, unknown>
        const key = `${targetType}:${Number(record.id)}`
        const savedAt = bookmarkedAt.get(key)
        if (!savedAt) continue
        resolved.set(key, {
          ...serializeIndexItem(record, targetType),
          targetType,
          access: readAccessTier(record),
          bookmarkedAt: savedAt,
        })
      }
    })
  )

  // Re-project through the bookmark rows so the page keeps its `-createdAt`
  // order; the per-collection fan-out above has no ordering of its own.
  const items = rows.docs.flatMap((row) => {
    const key = `${row.targetType}:${Number(row.targetId)}`
    const item = resolved.get(key)
    return item ? [item] : []
  })

  return {
    page,
    pageSize,
    totalDocs: rows.totalDocs,
    totalPages: rows.totalPages,
    hasNext: page < rows.totalPages,
    hasPrev: page > 1,
    items,
  }
}

export function emptyBookmarkCounts(): Record<BookmarkTargetType, number> {
  return Object.fromEntries(BOOKMARK_TARGET_TYPES.map((type) => [type, 0])) as Record<
    BookmarkTargetType,
    number
  >
}
