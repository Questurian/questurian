/** Public API payload for `single-type-listicles` (served under `/maps/[slug]`). */
import type { ArticleAuthor } from '@/features/articles/types'

export type MediaVariant = {
  url?: string
}

export type ListicleSelectedPhoto = {
  url?: string
  alt_text?: string
  variants?: Partial<Record<string, MediaVariant>>
}

export type ListicleVenue = {
  id: number
  title: string
  type?: string | null
  priceLevel?: string | null
  cuisines?: string[] | unknown
  idealFor?: string[] | unknown
  gallery?: unknown[]
  address?: string | null
  countryCode?: string | null
  phoneNumber?: string | null
  website?: string | null
  menuUrl?: string | null
  bookingUrl?: string | null
  /** Payload JSON: `{ hours: [{ day, hours }] }` */
  operationHours?: unknown
}

export type ListicleInstagramPost = {
  id?: number | string
  title?: string
  embedCode?: string
}

/** Tour Pick as shaped by the public API serializer (published tours only). */
export type ListicleTourPick = {
  id?: number
  title?: string | null
  price?: string | null
  bookingLink?: string | null
}

export type ListicleItemRow = {
  id: string
  blurb?: string
  item: ListicleVenue
  blockType?: string
  mediaMode?: string
  selectedPhotos?: ListicleSelectedPhoto[]
  /** Populated instagram-post when API `depth` includes relationship (e.g. 2). */
  selectedInstagramPost?: ListicleInstagramPost | number | string | null
  /** Operator-curated Tour Picks on attraction rows (ordered, max 4). */
  tours?: ListicleTourPick[] | null
}

export type MapsListicleHeader = {
  intro?: string | { root?: unknown }
  featuredImage?: {
    url: string
    alt_text?: string
  } | null
}

export type MapsListicleArticle = {
  id: number
  title: string
  slug: string
  articleType: 'single-type-listicle'
  publishedAt: string
  updatedAt?: string
  author?: ArticleAuthor | null
  header?: MapsListicleHeader | null
  items?: ListicleItemRow[]
  seoSection?: {
    metaDescription?: string
    seoTitle?: string
  }
}

export function isMapsListicleArticle(
  doc: unknown,
): doc is MapsListicleArticle {
  return (
    typeof doc === 'object' &&
    doc !== null &&
    'articleType' in doc &&
    (doc as MapsListicleArticle).articleType === 'single-type-listicle'
  )
}

export function isListicleVenue(value: unknown): value is ListicleVenue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ListicleVenue).title === 'string'
  )
}
