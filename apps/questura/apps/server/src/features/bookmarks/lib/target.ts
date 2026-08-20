import { isArticleTypeKey, TYPE_TO_COLLECTION, type ArticleTypeKey } from '@/features/articles/public/scope'

/**
 * A Bookmark target must have a public URL of its own (ADR-0010).
 *
 * A Bookmark exists to return the reader somewhere, so a document with no page
 * cannot be one. That test is what keeps venues out: `dining`,
 * `accommodations`, `attractions`, `nightlife` and `tours` render only inside
 * listicles, itineraries and homepage blocks, and `app/(public)` has no route
 * for any of them. `/[country]/[city]/[category]/[slug]` looks like a venue
 * route and is not — it renders a standard article.
 *
 * These are `ArticleTypeKey` values rather than collection slugs on purpose, so
 * `TYPE_TO_COLLECTION` remains the single mapping.
 */
export const BOOKMARK_TARGET_TYPES = ['articles', 'maps', 'itineraries'] as const

export type BookmarkTargetType = (typeof BOOKMARK_TARGET_TYPES)[number]

export function isBookmarkTargetType(value: unknown): value is BookmarkTargetType {
  return isArticleTypeKey(value) && (BOOKMARK_TARGET_TYPES as readonly string[]).includes(value)
}

export function bookmarkTargetCollection(type: BookmarkTargetType) {
  return TYPE_TO_COLLECTION[type as ArticleTypeKey]
}

/**
 * Ids are numeric in Postgres. Rejecting anything else here keeps a garbage id
 * from reaching `payload.find` as a `NaN`, which is an unhelpful 500 rather
 * than the 400 the caller earned.
 */
export function parseTargetId(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}
