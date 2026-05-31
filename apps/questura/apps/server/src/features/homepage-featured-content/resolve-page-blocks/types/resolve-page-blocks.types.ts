export type LocationDoc = {
  id: number
  locationKey?: string
  level?: string
  countryName?: string
  cityName?: string | null
  neighborhoodName?: string | null
}

export type RawBlock = {
  id: string
  blockType: string
  slotCount?: number
  sectionHeading?: string | null
  sectionSubheading?: string | null
  slot3Layout?: string
  slot4Layout?: string
  slot5Layout?: string
  mediaAspect?: string
  articleGridFourLayout?: string
  items?: unknown
}

export type LocationHomepageDoc = {
  id: number
  isEnabled?: boolean
  updatedAt?: string
  location?: LocationDoc | number | null
  pageBlocks?: RawBlock[]
  draftPageBlocks?: RawBlock[]
  publishedPageBlocks?: RawBlock[]
  lastPublishedAt?: string | null
  lastPublishedBy?: unknown
  publishedRevision?: number | null
}

export type CuratedBlockType =
  | 'featured-article'
  | 'featured-article-carousel'
  | 'featured-articles'
  | 'article-grid'
  | 'location-grid'
  | 'questurian-maps'
  | 'hotel-grid'
  | 'tour-grid'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'
  | 'things-to-do-attractions'
  | 'newsletter-signup'
  | 'article-list'
