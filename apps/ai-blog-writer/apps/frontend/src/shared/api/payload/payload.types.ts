export type Location = {
  id: number
  level: 'country' | 'city' | 'neighborhood'
  country: string
  city?: string | null
  neighborhood?: string | null
  countryName?: string
  cityName?: string
  neighborhoodName?: string
  locationKey: string
  parentKey?: string | null
  updatedAt: string
  createdAt: string
}

export type ArticleCategory = {
  id: number
  name: string
  slug?: string
  description?: string
  usageCount?: number
  status?: 'active' | 'archived'
  updatedAt: string
  createdAt: string
}

export type ArticleTag = {
  id: number
  name: string
  slug?: string
  displayName?: string
  description?: string
  usageCount?: number
  status?: 'active' | 'archived'
  updatedAt: string
  createdAt: string
}

export type MediaVariantKey =
  | 'thumbnail'
  | 'square'
  | 'wide'
  | 'portrait'
  | 'hero'
  | 'open_graph'
  | 'editorial'

export const ALL_VARIANT_KEYS: MediaVariantKey[] = [
  'thumbnail',
  'square',
  'wide',
  'portrait',
  'hero',
  'open_graph',
  'editorial'
]

export type MediaAsset = {
  id: number
  filename: string
  // canonical field names
  alt_text?: string | null
  photographer_credit?: string | null
  location?: string | null
  location_finalized?: boolean | null
  tags?: Array<number | ArticleTag> | null
  // legacy aliases some Payload contexts return
  alt?: string | null
  altText?: string | null
  mediaSet?:
    | number
    | string
    | { id?: number | string; title?: string | null }
    | null
  variant?: MediaVariantKey | null
  url?: string | null
  mimeType?: string | null
  filesize?: number | null
  width?: number | null
  height?: number | null
  updatedAt?: string
  createdAt?: string
}

export type MediaSetVariantAsset = {
  id: number
  filename?: string | null
  url?: string | null
  alt_text?: string | null
  width?: number | null
  height?: number | null
  updatedAt?: string | null
}

export type MediaSetStatus = 'empty' | 'partial' | 'usable' | 'complete'

export type MediaSet = {
  id: number
  title?: string | null
  alt_text?: string | null
  photographer_credit?: string | null
  // location can be a relationship (number|Location) or a legacy string key
  location?: number | Location | string | null
  location_finalized?: boolean | null
  tags?: Array<number | ArticleTag> | null
  status?: MediaSetStatus | string | null
  externalRef?: string | null
  source?: number | MediaSetVariantAsset | null
  focal_point?: {
    x?: number | null
    y?: number | null
  } | null
  variants?: {
    thumbnail?: number | MediaSetVariantAsset | null
    square?: number | MediaSetVariantAsset | null
    wide?: number | MediaSetVariantAsset | null
    portrait?: number | MediaSetVariantAsset | null
    hero?: number | MediaSetVariantAsset | null
    open_graph?: number | MediaSetVariantAsset | null
    editorial?: number | MediaSetVariantAsset | null
  } | null
  updatedAt?: string
  createdAt?: string
}

export type MediaSetPatch = {
  title?: string | null
  alt_text?: string | null
  photographer_credit?: string | null
  location?: number | null
  location_finalized?: boolean | null
  tags?: number[]
  focal_point?: {
    x: number
    y: number
  }
}
