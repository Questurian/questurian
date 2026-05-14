import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../../resolve-page-blocks/lib/section-heading'
import { resolveStoredSlotCountForBlockType } from '../../slot-count/service'
import type { RawHomepageBlockForConvert } from '../operations/assert'

export function sliceStoredSectionHeading(sectionHeading: unknown): string | undefined {
  if (typeof sectionHeading !== 'string' || !sectionHeading.trim()) return undefined
  const t = sectionHeading.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX)
  return t || undefined
}

export function sliceStoredSectionSubheading(sectionSubheading: unknown): string | undefined {
  if (typeof sectionSubheading !== 'string' || !sectionSubheading.trim()) return undefined
  const t = sectionSubheading.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX)
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
  const sub = sliceStoredSectionSubheading(old.sectionSubheading)
  if (sub) next.sectionSubheading = sub
  return next
}

export function normalizeSlotCountForBlockType(blockType: string, slotCount: number): number {
  return resolveStoredSlotCountForBlockType(blockType, slotCount)
}
