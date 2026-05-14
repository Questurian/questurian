import { HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES } from '../constants'

const EMPTY_CONVERT_SOURCE_SET = new Set<string>(HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES)

export function isHomepageBlockConvertibleWhenEmpty(blockType: string): boolean {
  return EMPTY_CONVERT_SOURCE_SET.has(blockType)
}

export type RawHomepageBlockForConvert = {
  id: string
  blockType: string
  slotCount?: number
  sectionHeading?: string | null
  sectionSubheading?: string | null
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
