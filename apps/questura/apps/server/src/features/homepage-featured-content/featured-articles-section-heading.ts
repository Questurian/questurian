import { homepageBlockSupportsSectionHeading } from './homepage-block-section-heading'

export const HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX = 120

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

type ApiCuratedBlock = {
  id: string
  blockType: string
  sectionHeading?: string | null
}

export function curatedBlockApiPayload(block: ApiCuratedBlock, selection: unknown) {
  if (homepageBlockSupportsSectionHeading(block.blockType)) {
    return {
      id: block.id,
      blockType: block.blockType,
      selection,
      sectionHeading: publicFeaturedArticlesSectionHeading(block),
    }
  }

  return { id: block.id, blockType: block.blockType, selection }
}
