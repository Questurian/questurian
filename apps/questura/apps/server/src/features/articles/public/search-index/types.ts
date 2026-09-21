import type { ArticleTypeKey } from '@/features/articles/public/scope'

/**
 * The `type_key` column's values.
 *
 * Identical to `ArticleTypeKey` and aliased rather than redeclared, because a
 * row written under one spelling and searched for under another is invisible
 * rather than wrong, which is the hardest kind of bug to notice.
 */
export type SearchTypeKey = ArticleTypeKey

export const COLLECTION_TO_SEARCH_TYPE = {
  articles: 'articles',
  'single-type-listicles': 'maps',
  'listicle-itineraries': 'itineraries',
} as const satisfies Record<string, SearchTypeKey>

export type SearchIndexedCollection = keyof typeof COLLECTION_TO_SEARCH_TYPE
