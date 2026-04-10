import type { HomepageFeaturedSelection } from './types'
import type { HomepageLocationGridSelection } from './locationGridTypes'
import type { HomepageHotelGridSelection } from './hotelGridTypes'

export type CuratedHomepageBlockType =
  | 'featured-articles'
  | 'article-grid'
  | 'location-grid'
  | 'hotel-grid'

export type ArticleCuratedHomepageBlockType =
  | 'featured-articles'
  | 'article-grid'

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
}

export const HOMEPAGE_PAGE_BLOCK_TYPES: CuratedHomepageBlockType[] = [
  'featured-articles',
  'article-grid',
  'location-grid',
  'hotel-grid',
]

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

export type ArticleCuratedHomepageBlockResponse =
  | FeaturedArticlesBlockResponse
  | ArticleGridBlockResponse

export type CuratedHomepageBlockResponse =
  | ArticleCuratedHomepageBlockResponse
  | LocationGridBlockResponse
  | HotelGridBlockResponse

export type UnknownBlockResponse = {
  id: string
  blockType: string
}

export type PageBlockResponse = CuratedHomepageBlockResponse | UnknownBlockResponse

export function isCuratedHomepageBlock(
  block: PageBlockResponse,
): block is CuratedHomepageBlockResponse {
  return (
    block.blockType === 'featured-articles'
    || block.blockType === 'article-grid'
    || block.blockType === 'location-grid'
    || block.blockType === 'hotel-grid'
  )
}

export function isArticleCuratedHomepageBlock(
  block: PageBlockResponse,
): block is ArticleCuratedHomepageBlockResponse {
  return block.blockType === 'featured-articles' || block.blockType === 'article-grid'
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
