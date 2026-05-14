export const HOMEPAGE_BLOCK_TYPES_WITH_OPTIONAL_SECTION_HEADING = [
  'featured-articles',
  'location-grid',
  'article-grid',
  'questurian-maps',
  'featured-article',
  'featured-article-carousel',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'hotel-grid',
  'tour-grid',
  'things-to-do-attractions',
  'newsletter-signup',
  'article-list',
] as const

export type HomepageBlockTypeWithOptionalSectionHeading =
  (typeof HOMEPAGE_BLOCK_TYPES_WITH_OPTIONAL_SECTION_HEADING)[number]

export function homepageBlockSupportsSectionHeading(blockType: string): boolean {
  return (HOMEPAGE_BLOCK_TYPES_WITH_OPTIONAL_SECTION_HEADING as readonly string[]).includes(blockType)
}

export const HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX = 120

/** Optional supporting line under the section heading (richer than the title). */
export const HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX = 200

type SectionHeadingParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: string | null }
  | { ok: false; message: string }

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
