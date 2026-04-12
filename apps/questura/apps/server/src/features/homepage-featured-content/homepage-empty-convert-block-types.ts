/**
 * Single list: block may use POST …/blocks/convert when `items` empty.
 *
 * When adding curated homepage block type:
 * 1. Add slug here (and `slot-count-for-block-type.ts` limits if new family).
 * 2. Mirror list in ai-blog-writer `pageBlocks.ts` → `CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES`
 *    (destination types) + `ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES` / editor props if new editor.
 *
 * Destinations are same list minus current block + minus `featured-articles` (add via POST /blocks).
 */
export const HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES = [
  'featured-articles',
  'featured-article',
  'article-grid',
  'location-grid',
  'questurian-maps',
  'hotel-grid',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'things-to-do-attractions',
] as const

export type HomepageEmptyConvertSourceBlockType =
  (typeof HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES)[number]

const EMPTY_CONVERT_SOURCE_SET = new Set<string>(HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES)

export function isHomepageBlockConvertibleWhenEmpty(blockType: string): boolean {
  return EMPTY_CONVERT_SOURCE_SET.has(blockType)
}
