import type { CuratedBlockType } from '../types'

import { CURATED_BLOCK_TYPES } from '../constants'
import { isCuratedBlockType } from '../lib/guards'
import { HOMEPAGE_BLOCK_SLOT_LIMITS } from '../../slot-count/constants'
import { isValidRequestedSlotCount } from '../../slot-count/lib/resolve'
import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
  homepageBlockSupportsSectionHeading,
} from '../lib/section-heading'

export type ParseNewBlockResult =
  | { ok: true; block: Record<string, unknown>; blockType: CuratedBlockType; slotCount: number }
  | { ok: false; status: number; message: string }

/**
 * Validates a POST /blocks request body and builds the new block record to append.
 *
 * Centralizes blockType + slotCount validation, section-heading trimming, and the
 * shape of the new block so the route handler stays focused on transport concerns.
 */
export function parseNewBlockInput(body: unknown): ParseNewBlockResult {
  const blockType: unknown = (body as { blockType?: unknown } | null)?.blockType

  if (!isCuratedBlockType(blockType)) {
    return {
      ok: false,
      status: 400,
      message: `Unsupported blockType. Supported types: ${CURATED_BLOCK_TYPES.join(', ')}.`,
    }
  }

  const slotLimits = HOMEPAGE_BLOCK_SLOT_LIMITS[blockType]
  const rawSlotCount = (body as { slotCount?: unknown } | null)?.slotCount

  let slotCount: number | null = null
  if (typeof rawSlotCount === 'number' && Number.isFinite(rawSlotCount)) {
    const n = Math.trunc(rawSlotCount)
    if (isValidRequestedSlotCount(blockType, n)) {
      slotCount = n
    }
  } else if (slotLimits.min === slotLimits.max) {
    slotCount = slotLimits.min
  }

  if (slotCount === null) {
    const message =
      blockType === 'article-grid'
        ? `slotCount must be 4 or 8 for "${blockType}".`
        : `slotCount must be between ${slotLimits.min} and ${slotLimits.max} for "${blockType}".`
    return { ok: false, status: 400, message }
  }

  const block: Record<string, unknown> = {
    blockType,
    slotCount,
    items: [],
  }

  if (homepageBlockSupportsSectionHeading(blockType)) {
    const sh = (body as { sectionHeading?: unknown } | null)?.sectionHeading
    if (typeof sh === 'string') {
      const t = sh.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX)
      if (t) block.sectionHeading = t
    }
    const ss = (body as { sectionSubheading?: unknown } | null)?.sectionSubheading
    if (typeof ss === 'string') {
      const t = ss.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX)
      if (t) block.sectionSubheading = t
    }
  }

  return { ok: true, block, blockType, slotCount }
}
