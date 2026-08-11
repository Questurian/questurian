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
  | 'article-list'

export type FeaturedArticleTeaser = {
  title: string
  articleType: string | null
  excerpt: string | null
  author: {
    id: number | null
    slug?: string | null
    /** The author's display name; name parts stayed with the staff account. */
    name: string | null
  } | null
  category: {
    id: number | null
    name: string | null
    slug: string | null
  } | null
  imageUrl: string | null
  imageUrlSquare: string | null
  articlePath: string | null
}

export type CityHomepageArticleBlock = {
  blockType: ArticleBackedHomepageBlockType
  totalSlots: number
  items: FeaturedArticleTeaser[]
  sectionHeading?: string | null
  sectionSubheading?: string | null
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

export type TourGridItem = {
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

export type TourGridSelection = {
  items: TourGridItem[]
  invalidItems: unknown[]
  allowDrafts: boolean
  totalSlots: number
  isComplete: boolean
}

export type TourGridBlock = {
  id: string
  blockType: 'tour-grid'
  sectionHeading: string | null
  sectionSubheading: string | null
  selection: TourGridSelection
}

export type LocationGridItem = {
  id: number
  level: string | null
  locationKey: string | null
  parentKey: string | null
  countryName: string | null
  cityName: string | null
  neighborhoodName: string | null
  title: string
  subtitle: string | null
  updatedAt: string | null
  coverImageUrl: string | null
  coverImageAlt: string | null
  slot?: number
}

export type LocationGridSelection = {
  items: LocationGridItem[]
  invalidItems: unknown[]
  isComplete: boolean
  totalSlots: number
}

export type LocationGridMediaAspect = 'rectangle' | 'square' | 'portrait'

export type LocationGridBlock = {
  id: string
  blockType: 'location-grid'
  sectionHeading: string | null
  sectionSubheading: string | null
  mediaAspect: LocationGridMediaAspect | null
  selection: LocationGridSelection
}

export type ThingsToDoAttractionItem = {
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

export type ThingsToDoAttractionsSelection = {
  items: ThingsToDoAttractionItem[]
  invalidItems: unknown[]
  allowDrafts: boolean
  totalSlots: number
  isComplete: boolean
}

export type ThingsToDoAttractionsBlock = {
  id: string
  blockType: 'things-to-do-attractions'
  sectionHeading: string | null
  sectionSubheading: string | null
  selection: ThingsToDoAttractionsSelection
}

export type NewsletterSignupBlock = {
  id: string
  blockType: 'newsletter-signup'
  sectionHeading: string | null
  sectionSubheading: string | null
  selection?: {
    items: unknown[]
    totalSlots: number
  }
}

export type CityHomepageBlock<TItem = unknown> =
  | CityHomepageArticleBlock
  | HotelGridBlock
  | TourGridBlock
  | LocationGridBlock
  | ThingsToDoAttractionsBlock
  | NewsletterSignupBlock
  | CityHomepageLegacyBlock<TItem>

export type FeaturedArticlesSlot3Layout = 'hero-left' | 'featured-center'

export type FeaturedArticlesBlock = CityHomepageArticleBlock & {
  blockType: 'featured-articles'
  /** Present when totalSlots === 3; picks between the two public 3-slot layouts. */
  slot3Layout?: FeaturedArticlesSlot3Layout | null
}

export type ArticleGridFourLayout = 'four-across' | 'two-by-two'

export type ArticleGridBlock = CityHomepageArticleBlock & {
  blockType: 'article-grid'
  /** Present when totalSlots === 4; picks the wide strip vs the 2×2 square grid. */
  articleGridFourLayout?: ArticleGridFourLayout | null
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
