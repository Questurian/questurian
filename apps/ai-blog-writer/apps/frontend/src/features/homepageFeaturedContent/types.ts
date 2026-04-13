export const HOMEPAGE_FEATURED_TOTAL_SLOTS = 10

export const HOMEPAGE_FEATURED_COLLECTIONS = [
  'articles',
  'single-type-listicles',
  'listicle-itineraries',
] as const

export type HomepageFeaturedCollection = (typeof HOMEPAGE_FEATURED_COLLECTIONS)[number]

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
  /** Square crop URL from media set when available; magazine layout prefers this. */
  imageUrlSquare?: string | null
  excerpt: string | null
  authorLabel: string | null
}

export type HomepageFeaturedInvalidItem = {
  slot: number
  relationTo?: string
  id?: number
  collectionLabel?: string
  reason: 'invalid_reference' | 'not_found' | 'not_published'
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
