import { HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX } from './featured-articles-section-heading'
import { isHomepageBlockConvertibleWhenEmpty } from './homepage-empty-convert-block-types'
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

export function assertFeaturedArticlesBlockConvertible(block: RawHomepageBlockForConvert): void {
  if (!isHomepageBlockConvertibleWhenEmpty(block.blockType)) {
    throw new Error('Only empty curated homepage blocks can change type this way.')
  }
  if (!rawHomepageBlockItemsAreEmpty(block.items)) {
    throw new Error('Clear all saved picks from this block before changing its type.')
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
