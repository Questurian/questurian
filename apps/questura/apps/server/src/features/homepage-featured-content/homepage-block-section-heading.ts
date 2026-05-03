/**
 * Block types that store optional `sectionHeading` and `sectionSubheading` in Payload (see
 * featured-articles-section-heading for max lengths).
 */
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
] as const

export type HomepageBlockTypeWithOptionalSectionHeading =
  (typeof HOMEPAGE_BLOCK_TYPES_WITH_OPTIONAL_SECTION_HEADING)[number]

export function homepageBlockSupportsSectionHeading(blockType: string): boolean {
  return (HOMEPAGE_BLOCK_TYPES_WITH_OPTIONAL_SECTION_HEADING as readonly string[]).includes(blockType)
}
