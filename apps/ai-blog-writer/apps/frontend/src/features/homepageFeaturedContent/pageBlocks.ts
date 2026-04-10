import type { HomepageFeaturedSelection } from './types'
import type { HomepageLocationGridSelection } from './locationGridTypes'
import type { HomepageHotelGridSelection } from './hotelGridTypes'

export type CuratedHomepageBlockType =
  | 'featured-article'
  | 'featured-articles'
  | 'article-grid'
  | 'location-grid'
  | 'hotel-grid'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'
  | 'things-to-do-attractions'

export type ArticleCuratedHomepageBlockType =
  | 'featured-article'
  | 'featured-articles'
  | 'article-grid'
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
    quickSlotCounts: [3, 4, 8, 9],
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
  'hotel-grid',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'things-to-do-attractions',
]

export type FeaturedArticleBlockResponse = {
  id: string
  blockType: 'featured-article'
  selection: HomepageFeaturedSelection
}

export type FeaturedArticlesBlockResponse = {
  id: string
  blockType: 'featured-articles'
  selection: HomepageFeaturedSelection
}

export type ArticleGridBlockResponse = {
  id: string
  blockType: 'article-grid'
  selection: HomepageFeaturedSelection
}

export type LocationGridBlockResponse = {
  id: string
  blockType: 'location-grid'
  selection: HomepageLocationGridSelection
}

export type HotelGridBlockResponse = {
  id: string
  blockType: 'hotel-grid'
  selection: HomepageHotelGridSelection
}

export type WhereToEatDrinkBlockResponse = {
  id: string
  blockType: 'where-to-eat-drink'
  selection: HomepageFeaturedSelection
}

export type ThingsToDoListiclesBlockResponse = {
  id: string
  blockType: 'things-to-do-listicles'
  selection: HomepageFeaturedSelection
}

export type ThingsToDoAttractionsBlockResponse = {
  id: string
  blockType: 'things-to-do-attractions'
  selection: HomepageHotelGridSelection
}

export type ArticleCuratedHomepageBlockResponse =
  | FeaturedArticleBlockResponse
  | FeaturedArticlesBlockResponse
  | ArticleGridBlockResponse
  | WhereToEatDrinkBlockResponse
  | ThingsToDoListiclesBlockResponse

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

export function isCuratedHomepageBlock(
  block: PageBlockResponse,
): block is CuratedHomepageBlockResponse {
  return (
    block.blockType === 'featured-article'
    || block.blockType === 'featured-articles'
    || block.blockType === 'article-grid'
    || block.blockType === 'location-grid'
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
