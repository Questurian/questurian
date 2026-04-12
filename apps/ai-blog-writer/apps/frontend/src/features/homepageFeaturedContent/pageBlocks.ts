import type { HomepageFeaturedSelection } from './types'
import type { HomepageLocationGridSelection } from './locationGridTypes'
import type { HomepageHotelGridSelection } from './hotelGridTypes'

export type CuratedHomepageBlockType =
  | 'featured-article'
  | 'featured-articles'
  | 'article-grid'
  | 'location-grid'
  | 'questurian-maps'
  | 'hotel-grid'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'
  | 'things-to-do-attractions'

export type ArticleCuratedHomepageBlockType =
  | 'featured-article'
  | 'featured-articles'
  | 'article-grid'
  | 'questurian-maps'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'

export type CuratedHomepageBlockConfig = {
  label: string
  description: string
  quickSlotCounts: number[]
  defaultSlotCount: number
  minSlotCount: number
  maxSlotCount: number
}

export const HOMEPAGE_PAGE_BLOCK_CONFIG: Record<
  CuratedHomepageBlockType,
  CuratedHomepageBlockConfig
> = {
  'featured-article': {
    label: 'Featured Article',
    description: 'Full-width dark hero highlighting one article or listicle',
    quickSlotCounts: [1],
    defaultSlotCount: 1,
    minSlotCount: 1,
    maxSlotCount: 1,
  },
  'featured-articles': {
    label: 'Featured Articles',
    description: 'A curated list of articles in fixed slots',
    quickSlotCounts: [3, 4, 7, 8, 9],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 9,
  },
  'article-grid': {
    label: 'Article Grid',
    description: 'A compact mixed-content grid displayed 3–4 across',
    quickSlotCounts: [3, 4, 5],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 5,
  },
  'location-grid': {
    label: 'Location Grid',
    description: 'A child-location grid for cities on main and neighborhoods on city homepages',
    quickSlotCounts: [4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 4,
    maxSlotCount: 8,
  },
  'questurian-maps': {
    label: 'Questurian Maps',
    description: 'Six single-type listicles in a 2×3 maps grid with headline styling',
    quickSlotCounts: [6],
    defaultSlotCount: 6,
    minSlotCount: 6,
    maxSlotCount: 6,
  },
  'hotel-grid': {
    label: 'Hotel Grid',
    description: 'A curated hotel card grid sourced from accommodations',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
  },
  'where-to-eat-drink': {
    label: 'Where to Eat & Drink',
    description: 'Dining-only single-type listicles',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
  },
  'things-to-do-listicles': {
    label: 'Things to Do (Listicles)',
    description: 'Attractions single-type listicles only',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
  },
  'things-to-do-attractions': {
    label: 'Things to Do (Places)',
    description: 'A curated grid of attraction records',
    quickSlotCounts: [3, 4, 6, 8],
    defaultSlotCount: 4,
    minSlotCount: 3,
    maxSlotCount: 12,
  },
}

export const HOMEPAGE_PAGE_BLOCK_TYPES: CuratedHomepageBlockType[] = [
  'featured-article',
  'featured-articles',
  'article-grid',
  'location-grid',
  'questurian-maps',
  'hotel-grid',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'things-to-do-attractions',
]

/**
 * Destination types when converting an empty block (any curated editor). Section title kept when
 * supported. Excludes `featured-articles` (use Add block for that shape).
 *
 * **Sync:** Questura `homepage-empty-convert-block-types.ts` → `HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES`.
 * This array = valid **targets** (no `featured-articles`; add that shape via Add block). New type → update both + slot limits + editor.
 */
export const CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES: CuratedHomepageBlockType[] = [
  'featured-article',
  'article-grid',
  'location-grid',
  'questurian-maps',
  'hotel-grid',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'things-to-do-attractions',
]

export type FeaturedArticleBlockResponse = {
  id: string
  blockType: 'featured-article'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
}

export type FeaturedArticlesBlockResponse = {
  id: string
  blockType: 'featured-articles'
  selection: HomepageFeaturedSelection
  /** Optional label for this block on the public homepage (e.g. section title). */
  sectionHeading: string | null
}

export type ArticleGridBlockResponse = {
  id: string
  blockType: 'article-grid'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
}

export type LocationGridBlockResponse = {
  id: string
  blockType: 'location-grid'
  selection: HomepageLocationGridSelection
  /** Optional label for this block on the public homepage (e.g. section title). */
  sectionHeading: string | null
}

export type QuesturianMapsBlockResponse = {
  id: string
  blockType: 'questurian-maps'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
}

export type HotelGridBlockResponse = {
  id: string
  blockType: 'hotel-grid'
  selection: HomepageHotelGridSelection
  sectionHeading: string | null
}

export type WhereToEatDrinkBlockResponse = {
  id: string
  blockType: 'where-to-eat-drink'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
}

export type ThingsToDoListiclesBlockResponse = {
  id: string
  blockType: 'things-to-do-listicles'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
}

export type ThingsToDoAttractionsBlockResponse = {
  id: string
  blockType: 'things-to-do-attractions'
  selection: HomepageHotelGridSelection
  sectionHeading: string | null
}

export type ArticleCuratedHomepageBlockResponse =
  | FeaturedArticleBlockResponse
  | FeaturedArticlesBlockResponse
  | ArticleGridBlockResponse
  | QuesturianMapsBlockResponse
  | WhereToEatDrinkBlockResponse
  | ThingsToDoListiclesBlockResponse

/** Block types edited with {@link CuratedHomepageBlockEditor}; empty blocks may convert to another type. */
export const ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES: ArticleCuratedHomepageBlockType[] = [
  'featured-article',
  'featured-articles',
  'article-grid',
  'questurian-maps',
  'where-to-eat-drink',
  'things-to-do-listicles',
]

export type CuratedHomepageBlockResponse =
  | ArticleCuratedHomepageBlockResponse
  | LocationGridBlockResponse
  | HotelGridBlockResponse
  | ThingsToDoAttractionsBlockResponse

export type UnknownBlockResponse = {
  id: string
  blockType: string
}

export type PageBlockResponse = CuratedHomepageBlockResponse | UnknownBlockResponse

/** Same Payload `id` can change `blockType` / slot count (convert). Include shape in React key + query key so editors remount and TanStack cache does not reuse old `selection`. */
export function homepageBlockShapeIdentity(block: {
  id: string
  blockType: string
  selection: { totalSlots: number }
}): readonly [string, string, number] {
  return [block.id, block.blockType, block.selection.totalSlots]
}

export function isCuratedHomepageBlock(
  block: PageBlockResponse,
): block is CuratedHomepageBlockResponse {
  return (
    block.blockType === 'featured-article'
    || block.blockType === 'featured-articles'
    || block.blockType === 'article-grid'
    || block.blockType === 'location-grid'
    || block.blockType === 'questurian-maps'
    || block.blockType === 'hotel-grid'
    || block.blockType === 'where-to-eat-drink'
    || block.blockType === 'things-to-do-listicles'
    || block.blockType === 'things-to-do-attractions'
  )
}

export function isArticleCuratedHomepageBlock(
  block: PageBlockResponse,
): block is ArticleCuratedHomepageBlockResponse {
  return block.blockType === 'featured-article'
    || block.blockType === 'featured-articles'
    || block.blockType === 'article-grid'
    || block.blockType === 'questurian-maps'
    || block.blockType === 'where-to-eat-drink'
    || block.blockType === 'things-to-do-listicles'
}

export function isLocationGridBlock(
  block: PageBlockResponse,
): block is LocationGridBlockResponse {
  return block.blockType === 'location-grid'
}

export function isHotelGridBlock(
  block: PageBlockResponse,
): block is HotelGridBlockResponse {
  return block.blockType === 'hotel-grid'
}

export function isThingsToDoAttractionsBlock(
  block: PageBlockResponse,
): block is ThingsToDoAttractionsBlockResponse {
  return block.blockType === 'things-to-do-attractions'
}

export type HotelOrAttractionGridBlockResponse = HotelGridBlockResponse | ThingsToDoAttractionsBlockResponse
