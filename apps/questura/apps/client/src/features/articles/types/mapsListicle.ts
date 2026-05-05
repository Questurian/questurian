/** Public API payload for `single-type-listicles` (served under `/maps/[slug]`). */

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
  type: string
  priceLevel?: string
  cuisines?: string[]
  idealFor?: string[]
  gallery?: unknown[]
  address?: string
  countryCode?: string
  phoneNumber?: string
  website?: string
  menuUrl?: string
  reservationUrl?: string
  /** Payload JSON: `{ hours: [{ day, hours }] }` */
  operationHours?: unknown
}

export type ListicleInstagramPost = {
  id?: number | string
  title?: string
  embedCode?: string
}

export type ListicleItemRow = {
  id: string
  blurb?: string
  item: ListicleVenue
  mediaMode?: string
  selectedPhotos?: ListicleSelectedPhoto[]
  /** Populated instagram-post when API `depth` includes relationship (e.g. 2). */
  selectedInstagramPost?: ListicleInstagramPost | number | string | null
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
