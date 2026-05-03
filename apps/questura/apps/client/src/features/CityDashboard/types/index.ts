import type { ComponentType } from 'react'

export interface CityDashboardProps {
  citySlug: string
  countrySlug: string
}

export interface CityHomepageContentProps {
  location?: CityHomepageLocation | null
  pageBlocks: CityHomepageBlock[]
}

export type CityHomepageLocation = {
  id: number
  locationKey: string | null
  level: string | null
  countryName: string | null
  cityName: string | null
  neighborhoodName: string | null
}

export type CityHomepageSelection<TItem = unknown> = {
  items: TItem[]
  invalidItems?: unknown[]
  allowDrafts?: boolean
  isComplete?: boolean
  totalSlots: number
}

export type CityHomepageLegacyBlock<TItem = unknown> = {
  id: string
  blockType: string
  selection?: CityHomepageSelection<TItem>
  sectionHeading?: string | null
  sectionSubheading?: string | null
}

export type CityHomepageResponse = {
  pageBlocks: CityHomepageBlock[]
}

export type ArticleBackedHomepageBlockType =
  | 'featured-article'
  | 'featured-article-carousel'
  | 'featured-articles'
  | 'article-grid'
  | 'questurian-maps'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'

export type FeaturedArticleTeaser = {
  title: string
  articleType: string | null
  excerpt: string | null
  author: {
    id: number | null
    name: string | null
    firstName: string | null
    lastName: string | null
  } | null
  category: {
    id: number | null
    name: string | null
    slug: string | null
  } | null
  imageUrl: string | null
  imageUrlSquare: string | null
}

export type CityHomepageArticleBlock = {
  blockType: ArticleBackedHomepageBlockType
  totalSlots: number
  items: FeaturedArticleTeaser[]
}

export type HotelGridItem = {
  id: number
  title: string
  slug: string | null
  type: string | null
  priceLevel: string | null
  status: string | null
  updatedAt: string | null
  imageUrl: string | null
  location: string | null
  slot?: number
}

export type HotelGridSelection = {
  items: HotelGridItem[]
  invalidItems: unknown[]
  allowDrafts: boolean
  totalSlots: number
  isComplete: boolean
}

export type HotelGridBlock = {
  id: string
  blockType: 'hotel-grid'
  sectionHeading: string | null
  sectionSubheading: string | null
  selection: HotelGridSelection
}

export type CityHomepageBlock<TItem = unknown> =
  | CityHomepageArticleBlock
  | HotelGridBlock
  | CityHomepageLegacyBlock<TItem>

export type FeaturedArticlesBlock = CityHomepageArticleBlock & {
  blockType: 'featured-articles'
}

export type HomepageBlockLayoutProps<TBlock extends CityHomepageBlock = CityHomepageBlock> = {
  block: TBlock
  location: CityHomepageLocation | null
}

export type HomepageBlockLayoutDefinition = {
  blockType: string
  totalSlots: number
  Component: ComponentType<HomepageBlockLayoutProps>
}

export type HomepageBlockLayoutFallbackDefinition = {
  blockType: string
  Component: ComponentType<HomepageBlockLayoutProps>
}

export type HomepageBlockLayoutKey = `${string}:${number}`
