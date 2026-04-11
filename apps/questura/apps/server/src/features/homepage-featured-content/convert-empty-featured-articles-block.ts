import { HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX } from './featured-articles-section-heading'
import { resolveStoredSlotCountForBlockType } from './slot-count-for-block-type'

export type RawHomepageBlockForConvert = {
  id: string
  blockType: string
  slotCount?: number
  sectionHeading?: string | null
  items?: unknown
}

export function rawHomepageBlockItemsAreEmpty(items: unknown): boolean {
  if (items == null) return true
  if (Array.isArray(items) && items.length === 0) return true
  return false
}

/** Article-curated blocks that use the same convert API when they have no items. */
const BLOCK_TYPES_CONVERTIBLE_WHEN_EMPTY = new Set([
  'featured-articles',
  'featured-article',
  'article-grid',
  'questurian-maps',
  'where-to-eat-drink',
  'things-to-do-listicles',
])

export function assertFeaturedArticlesBlockConvertible(block: RawHomepageBlockForConvert): void {
  if (!BLOCK_TYPES_CONVERTIBLE_WHEN_EMPTY.has(block.blockType)) {
    throw new Error(
      'Only empty article-curated blocks (same editor as Featured Articles) can change type this way.',
    )
  }
  if (!rawHomepageBlockItemsAreEmpty(block.items)) {
    throw new Error('Remove all articles from this block before changing its type.')
  }
}

export function sliceStoredSectionHeading(sectionHeading: unknown): string | undefined {
  if (typeof sectionHeading !== 'string' || !sectionHeading.trim()) return undefined
  const t = sectionHeading.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX)
  return t || undefined
}

/**
 * Preserves optional section title when converting an empty Featured Article(s) block.
 */
export function buildConvertedHomepageBlock(
  old: RawHomepageBlockForConvert,
  nextBlockType: string,
  slotCount: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    id: old.id,
    blockType: nextBlockType,
    slotCount,
    items: [],
  }
  const h = sliceStoredSectionHeading(old.sectionHeading)
  if (h) next.sectionHeading = h
  return next
}

export function normalizeSlotCountForBlockType(blockType: string, slotCount: number): number {
  return resolveStoredSlotCountForBlockType(blockType, slotCount)
}
