export type PexelsPhoto = {
  id: number | string
  width?: number
  height?: number
  alt?: string
  photographer?: string
  photographer_url?: string
  pexels_url?: string
  image_url: string
  image_url_large?: string
  image_url_portrait?: string
  image_url_original?: string
}

export type PexelsOrientation = 'landscape' | 'portrait' | 'square'
export type ExternalImageProvider = 'unsplash' | 'pexels'

export type UnsplashPhoto = {
  id: string
  width?: number
  height?: number
  alt?: string
  photographer?: string
  photographer_url?: string
  unsplash_url?: string
  image_url: string
  image_url_regular?: string
  image_url_full?: string
  image_url_raw?: string
}

export type PexelsSearchResponse = {
  success: boolean
  query: string
  page: number
  per_page: number
  total_results: number
  photos: PexelsPhoto[]
}

export type UnsplashSearchResponse = {
  success: boolean
  query: string
  page: number
  per_page: number
  total_results: number
  photos: UnsplashPhoto[]
}

export type ImportExternalImageRequest = {
  sourceUrl: string
  provider: ExternalImageProvider
  externalRef: string
  altText: string
  photographerCredit: string
  locationRef: number
  photoId?: string | number
}

export type ImportExternalImageResponse = {
  success: boolean
  mediaSetId: string
  externalRef: string
  provider: ExternalImageProvider
  sourceUrl: string
  variantAssetIds?: {
    [key: string]: string
  }
  variants: {
    [key: string]: {
      filename: string
      width: number
      height: number
      size: number
    }
  }
}

export type FetchExternalImageSourceRequest = {
  sourceUrl: string
  provider: ExternalImageProvider
  photoId?: string | number
}

export type FetchExternalImageSourceResponse = {
  blob: Blob
  fileName: string
  contentType: string
}
