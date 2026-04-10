export const HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG = 'homepage-featured-content'

export const HOMEPAGE_FEATURED_CONTENT_SLOTS = 10
export const HOMEPAGE_HOTEL_GRID_MIN_SLOTS = 3
export const HOMEPAGE_HOTEL_GRID_MAX_SLOTS = 12
export const HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS = 3
export const HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS = 12

export const HOMEPAGE_FEATURED_CONTENT_COLLECTIONS = [
  'articles',
  'single-type-listicles',
  'listicle-itineraries',
] as const

export type HomepageFeaturedCollection = (typeof HOMEPAGE_FEATURED_CONTENT_COLLECTIONS)[number]

export type HomepageFeaturedItemRef = {
  relationTo: HomepageFeaturedCollection
  id: number
}

export type HomepageFeaturedCandidate = HomepageFeaturedItemRef & {
  slot?: number
  title: string
  slug: string | null
  status: string | null
  updatedAt: string | null
  publishedAt: string | null
  collectionLabel: string
  imageUrl: string | null
}

export type HomepageFeaturedInvalidReason =
  | 'invalid_reference'
  | 'not_found'
  | 'not_published'

export type HomepageFeaturedInvalidItem = {
  slot: number
  relationTo?: string
  id?: number
  collectionLabel?: string
  reason: HomepageFeaturedInvalidReason
}

export type HomepageFeaturedSelection = {
  items: HomepageFeaturedCandidate[]
  invalidItems: HomepageFeaturedInvalidItem[]
  isComplete: boolean
  allowDrafts: boolean
  totalSlots: number
}

export type HomepageFeaturedCandidatesResponse = {
  docs: HomepageFeaturedCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  allowDrafts: boolean
}

export type HomepageHotelItemRef = {
  id: number
}

export type HomepageHotelCandidate = HomepageHotelItemRef & {
  slot?: number
  title: string
  slug: string | null
  type: string | null
  priceLevel: string | null
  status: string | null
  updatedAt: string | null
  imageUrl: string | null
  location: string | null
}

export type HomepageHotelInvalidReason = 'invalid_reference' | 'not_found' | 'not_published'

export type HomepageHotelInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: HomepageHotelInvalidReason
}

export type HomepageHotelSelection = {
  items: HomepageHotelCandidate[]
  invalidItems: HomepageHotelInvalidItem[]
  isComplete: boolean
  allowDrafts: boolean
  totalSlots: number
}

export type HomepageHotelCandidatesResponse = {
  docs: HomepageHotelCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  allowDrafts: boolean
}
