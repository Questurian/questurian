/**
 * Block types that store an optional `sectionHeading` in Payload (same max length everywhere).
 */
export const HOMEPAGE_BLOCK_TYPES_WITH_OPTIONAL_SECTION_HEADING = [
  'featured-articles',
  'location-grid',
  'article-grid',
  'questurian-maps',
  'featured-article',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'hotel-grid',
  'things-to-do-attractions',
] as const

export type HomepageBlockTypeWithOptionalSectionHeading =
  (typeof HOMEPAGE_BLOCK_TYPES_WITH_OPTIONAL_SECTION_HEADING)[number]

export function homepageBlockSupportsSectionHeading(blockType: string): boolean {
  return (HOMEPAGE_BLOCK_TYPES_WITH_OPTIONAL_SECTION_HEADING as readonly string[]).includes(blockType)
}
