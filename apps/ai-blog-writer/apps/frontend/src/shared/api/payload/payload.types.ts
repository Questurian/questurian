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

export type MediaAsset = {
  id: number
  filename: string
  alt?: string
  alt_text?: string
  altText?: string
  mediaSet?: number | string | { id?: number | string } | null
  variant?:
    | 'thumbnail'
    | 'square'
    | 'wide'
    | 'portrait'
    | 'hero'
    | 'open_graph'
    | 'editorial'
  url?: string
  mimeType?: string
  filesize?: number
  width?: number
  height?: number
}

export type MediaSetVariantAsset = {
  id: number
  filename?: string | null
  url?: string | null
  alt_text?: string | null
}

export type MediaSet = {
  id: number
  title?: string | null
  location?: string | null
  alt_text?: string | null
  status?: string | null
  variants?: {
    thumbnail?: number | MediaSetVariantAsset | null
    square?: number | MediaSetVariantAsset | null
    wide?: number | MediaSetVariantAsset | null
    portrait?: number | MediaSetVariantAsset | null
    hero?: number | MediaSetVariantAsset | null
    open_graph?: number | MediaSetVariantAsset | null
    editorial?: number | MediaSetVariantAsset | null
  } | null
}
