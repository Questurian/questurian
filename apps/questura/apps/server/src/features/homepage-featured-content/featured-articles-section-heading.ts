import { homepageBlockSupportsSectionHeading } from './homepage-block-section-heading'
import { publicArticleGridFourLayout } from './article-grid-four-layout'
import { publicLocationGridMediaAspect } from './location-grid-media-aspect'

export const HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX = 120

/** Optional supporting line under the section heading (richer than the title). */
export const HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX = 200

export const FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES = ['hero-left', 'featured-center'] as const

export type FeaturedArticlesSlot3Layout = (typeof FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES)[number]

export function normalizeFeaturedArticlesSlot3Layout(raw: unknown): FeaturedArticlesSlot3Layout {
  if (raw === 'featured-center' || raw === 'hero-left') return raw
  return 'hero-left'
}

/**
 * API shape for 3-slot featured-articles blocks; null when not applicable.
 */
export function publicFeaturedArticlesSlot3Layout(
  block: { slot3Layout?: unknown },
  totalSlots: number,
): FeaturedArticlesSlot3Layout | null {
  if (totalSlots !== 3) return null
  return normalizeFeaturedArticlesSlot3Layout(block.slot3Layout)
}

type Slot3LayoutParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: FeaturedArticlesSlot3Layout }
  | { ok: false; message: string }

/**
 * Reads `slot3Layout` from JSON body. `omit` when key absent.
 */
export function parseSlot3LayoutBodyField(body: Record<string, unknown>): Slot3LayoutParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'slot3Layout')) {
    return { ok: true, omit: true }
  }

  const v = body.slot3Layout
  if (v === null) {
    return { ok: true, omit: false, value: 'hero-left' }
  }
  if (typeof v !== 'string') {
    return { ok: false, message: 'slot3Layout must be a string.' }
  }

  if (!(FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES as readonly string[]).includes(v)) {
    return {
      ok: false,
      message: `slot3Layout must be one of: ${FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES.join(', ')}.`,
    }
  }

  return { ok: true, omit: false, value: v as FeaturedArticlesSlot3Layout }
}

export const FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES = ['sidebar-stack', 'one-over-three'] as const

export type FeaturedArticlesSlot4Layout = (typeof FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES)[number]

export function normalizeFeaturedArticlesSlot4Layout(raw: unknown): FeaturedArticlesSlot4Layout {
  if (raw === 'one-over-three' || raw === 'sidebar-stack') return raw
  return 'sidebar-stack'
}

export function publicFeaturedArticlesSlot4Layout(
  block: { slot4Layout?: unknown },
  totalSlots: number,
): FeaturedArticlesSlot4Layout | null {
  if (totalSlots !== 4) return null
  return normalizeFeaturedArticlesSlot4Layout(block.slot4Layout)
}

type Slot4LayoutParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: FeaturedArticlesSlot4Layout }
  | { ok: false; message: string }

export function parseSlot4LayoutBodyField(body: Record<string, unknown>): Slot4LayoutParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'slot4Layout')) {
    return { ok: true, omit: true }
  }

  const v = body.slot4Layout
  if (v === null) {
    return { ok: true, omit: false, value: 'sidebar-stack' }
  }
  if (typeof v !== 'string') {
    return { ok: false, message: 'slot4Layout must be a string.' }
  }

  if (!(FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES as readonly string[]).includes(v)) {
    return {
      ok: false,
      message: `slot4Layout must be one of: ${FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES.join(', ')}.`,
    }
  }

  return { ok: true, omit: false, value: v as FeaturedArticlesSlot4Layout }
}

export const FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES = ['card-grid', 'hero-sidebar'] as const

export type FeaturedArticlesSlot5Layout = (typeof FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES)[number]

export function normalizeFeaturedArticlesSlot5Layout(raw: unknown): FeaturedArticlesSlot5Layout {
  if (raw === 'hero-sidebar' || raw === 'card-grid') return raw
  return 'card-grid'
}

export function publicFeaturedArticlesSlot5Layout(
  block: { slot5Layout?: unknown },
  totalSlots: number,
): FeaturedArticlesSlot5Layout | null {
  if (totalSlots !== 5) return null
  return normalizeFeaturedArticlesSlot5Layout(block.slot5Layout)
}

type Slot5LayoutParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: FeaturedArticlesSlot5Layout }
  | { ok: false; message: string }

export function parseSlot5LayoutBodyField(body: Record<string, unknown>): Slot5LayoutParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'slot5Layout')) {
    return { ok: true, omit: true }
  }

  const v = body.slot5Layout
  if (v === null) {
    return { ok: true, omit: false, value: 'card-grid' }
  }
  if (typeof v !== 'string') {
    return { ok: false, message: 'slot5Layout must be a string.' }
  }

  if (!(FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES as readonly string[]).includes(v)) {
    return {
      ok: false,
      message: `slot5Layout must be one of: ${FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES.join(', ')}.`,
    }
  }

  return { ok: true, omit: false, value: v as FeaturedArticlesSlot5Layout }
}

type SectionHeadingParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: string | null }
  | { ok: false; message: string }

/**
 * Reads `sectionHeading` from a JSON body. `omit` when key absent — caller should not change stored value.
 */
export function parseSectionHeadingBodyField(body: Record<string, unknown>): SectionHeadingParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'sectionHeading')) {
    return { ok: true, omit: true }
  }

  const v = body.sectionHeading
  if (v === null) return { ok: true, omit: false, value: null }
  if (typeof v !== 'string') {
    return { ok: false, message: 'sectionHeading must be a string or null.' }
  }

  const t = v.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX)
  return { ok: true, omit: false, value: t.length ? t : null }
}

export function publicFeaturedArticlesSectionHeading(block: { sectionHeading?: unknown }): string | null {
  const s = block.sectionHeading
  if (typeof s !== 'string' || !s.trim()) return null
  return s.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX)
}

type SectionSubheadingParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: string | null }
  | { ok: false; message: string }

/**
 * Reads `sectionSubheading` from a JSON body. `omit` when key absent — caller should not change stored value.
 */
export function parseSectionSubheadingBodyField(
  body: Record<string, unknown>,
): SectionSubheadingParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'sectionSubheading')) {
    return { ok: true, omit: true }
  }

  const v = body.sectionSubheading
  if (v === null) return { ok: true, omit: false, value: null }
  if (typeof v !== 'string') {
    return { ok: false, message: 'sectionSubheading must be a string or null.' }
  }

  const t = v.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX)
  return { ok: true, omit: false, value: t.length ? t : null }
}

export function publicFeaturedArticlesSectionSubheading(block: {
  sectionSubheading?: unknown
}): string | null {
  const s = block.sectionSubheading
  if (typeof s !== 'string' || !s.trim()) return null
  return s.trim().slice(0, HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX)
}

type ApiCuratedBlock = {
  id: string
  blockType: string
  sectionHeading?: string | null
  sectionSubheading?: string | null
  slot3Layout?: unknown
  slot4Layout?: unknown
  slot5Layout?: unknown
  mediaAspect?: unknown
  articleGridFourLayout?: unknown
}

export function curatedBlockApiPayload(block: ApiCuratedBlock, selection: unknown) {
  if (homepageBlockSupportsSectionHeading(block.blockType)) {
    const base = {
      id: block.id,
      blockType: block.blockType,
      selection,
      sectionHeading: publicFeaturedArticlesSectionHeading(block),
      sectionSubheading: publicFeaturedArticlesSectionSubheading(block),
    }
    if (block.blockType === 'featured-articles') {
      const totalSlots =
        typeof selection === 'object' && selection !== null && 'totalSlots' in selection
          ? Number((selection as { totalSlots: number }).totalSlots)
          : 0
      return {
        ...base,
        slot3Layout: publicFeaturedArticlesSlot3Layout(block, totalSlots),
        slot4Layout: publicFeaturedArticlesSlot4Layout(block, totalSlots),
        slot5Layout: publicFeaturedArticlesSlot5Layout(block, totalSlots),
      }
    }
    if (block.blockType === 'location-grid') {
      return {
        ...base,
        mediaAspect: publicLocationGridMediaAspect(block),
      }
    }
    if (block.blockType === 'article-grid') {
      const totalSlots =
        typeof selection === 'object' && selection !== null && 'totalSlots' in selection
          ? Number((selection as { totalSlots: number }).totalSlots)
          : 0
      return {
        ...base,
        articleGridFourLayout: publicArticleGridFourLayout(block, totalSlots),
      }
    }
    return base
  }

  return { id: block.id, blockType: block.blockType, selection }
}
