import type { PublicImage } from '@/features/media/lib/resolve-public-image'

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

export type HomepageFeaturedAuthorAvatar = {
  url: string
  alt: string | null
}

export type HomepageFeaturedAuthor = {
  id: number | null
  slug: string | null
  /** The author's display name. Name parts left with the staff account (ADR-0007). */
  name: string | null
  /** Profile photo when the author upload is populated. */
  avatar?: HomepageFeaturedAuthorAvatar | null
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
  canonicalPath: string | null
  status: string | null
  updatedAt: string | null
  publishedAt: string | null
  collectionLabel: string
  /** @deprecated Read `image.url` instead. Kept for back-compat. */
  imageUrl: string | null
  /**
   * @deprecated Read `imageSquare.url` instead. Kept for back-compat.
   * Square (1:1) asset URL when featured image links to a media set with a square variant,
   * or when the featured upload is the square variant.
   */
  imageUrlSquare: string | null
  /** Resolved card-placement image with url, alt, dimensions, variant, status. */
  image: PublicImage | null
  /** Resolved square-card placement image. Null when no square variant exists. */
  imageSquare: PublicImage | null
  /** Resolved wide-card placement image. Used by publish validation for wide editorial slots. */
  imageWide: PublicImage | null
  /** Resolved hero placement image. Used by publish validation for hero editorial slots. */
  imageHero: PublicImage | null
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
