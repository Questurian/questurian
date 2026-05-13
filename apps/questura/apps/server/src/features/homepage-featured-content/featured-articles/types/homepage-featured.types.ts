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

export type HomepageFeaturedAuthor = {
  id: number | null
  name: string | null
  firstName: string | null
  lastName: string | null
}

export type HomepageFeaturedCategory = {
  id: number | null
  name: string | null
  slug: string | null
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
  /**
   * Square (1:1) asset URL when featured image links to a media set with a square variant,
   * or when the featured upload is the square variant. Null → UI may crop `imageUrl`.
   */
  imageUrlSquare: string | null
  /** SEO meta description when present (articles, listicles, itineraries). */
  metaDescription: string | null
  /** Backward-compatible alias for `metaDescription`. */
  excerpt: string | null
  /** Structured author preview when the author relationship is populated. */
  author: HomepageFeaturedAuthor | null
  /** Resolved author display name when relationship populated at depth ≥ 1. */
  authorLabel: string | null
  /** Structured article category preview when present. */
  category: HomepageFeaturedCategory | null
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
