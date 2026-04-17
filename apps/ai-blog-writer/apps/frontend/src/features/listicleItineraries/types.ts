import type { EditorAssistModelName } from '../staging/api'
import type { LocationLevel } from '../locationScope/types'

export type ItineraryBlockType =
  | 'itinerary-dining'
  | 'itinerary-accommodations'
  | 'itinerary-attractions'
  | 'itinerary-nightlife'
  | 'itinerary-key-location'
  | 'itinerary-tour-agency'

export const TOUR_AGENCY_BLOCK_TYPE = 'itinerary-tour-agency'

export function isManualItineraryBlockType(blockType: ItineraryBlockType): boolean {
  return blockType === TOUR_AGENCY_BLOCK_TYPE
}

export type MediaMode = 'photos' | 'instagram' | 'both'

export type RelatedItemCollection =
  | 'dining'
  | 'accommodations'
  | 'attractions'
  | 'nightlife'
  | 'key-locations'

export type TourAgencyKeyLocationSource = 'existing' | 'manual'

export const TOUR_AGENCY_PRICE_TIERS = ['$', '$$', '$$$', '$$$$'] as const

export type TourAgencyPriceTier = (typeof TOUR_AGENCY_PRICE_TIERS)[number]

export type TourAgencyStartingPoint = {
  label: string
  latitude: string
  longitude: string
}

export type TourAgencyKeyLocationRow = {
  id: string
  source: TourAgencyKeyLocationSource
  relatedCollection: RelatedItemCollection | null
  relatedItem: number | null
  title: string
  latitude: string
  longitude: string
}

export type PolymorphicRelatedItemValue = {
  relationTo?: RelatedItemCollection | null
  value?: number | { id?: number } | null
}

export type PayloadRichText = Record<string, unknown>

export type SeoTwitterCardType = 'summary' | 'summary_large_image'

export type SeoSection = {
  seoTitle: string
  metaDescription: string
  openGraph: {
    title: string
    description: string
    imageUrl: string
    url: string
  }
  twitterCard: {
    card: SeoTwitterCardType
    title: string
    description: string
    imageUrl: string
  }
  structuredData: string
  robots: {
    index: 'index' | 'noindex'
    follow: 'follow' | 'nofollow'
  }
}

export type ItineraryItemBlock = {
  id: string
  blockType: ItineraryBlockType
  item: number | null
  mediaMode: MediaMode
  selectedPhotos: number[]
  selectedInstagramPost: number | null
  title: string
  operator: string
  price: TourAgencyPriceTier | ''
  url: string
  tourDuration: number
  startingPoint: TourAgencyStartingPoint
  keyLocations: TourAgencyKeyLocationRow[]
  image: number | null
  instagramPost: number | null
  blurbMarkdown: string
  blurbLexical?: PayloadRichText
  blurbJsonText?: string
}

export type ListicleItineraryDraft = {
  draftId: string
  payloadId?: number
  payloadStatus?: 'draft' | 'published'
  payloadSlug?: string
  payloadPublishedAt?: string
  payloadUpdatedAt?: string
  payloadAuthorName?: string
  editorModelName: EditorAssistModelName
  title: string
  location: string
  locationRef: number | null
  sharedNeighborhoods: number[]
  step1_complete: boolean
  in_update_mode: boolean
  step2_complete: boolean
  step2_in_update_mode: boolean
  step3_complete: boolean
  step3_in_update_mode: boolean
  header: {
    introMarkdown: string
    introLexical?: PayloadRichText
    introJsonText?: string
    featuredImage: number | null
  }
  items: ItineraryItemBlock[]
  seoSection: SeoSection
  status: 'draft' | 'published'
  articleType: 'listicle-itinerary'
  updatedAt: string
}

export type PayloadItineraryAuthor = {
  id?: number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

export type PayloadItineraryDoc = {
  id: number
  title?: string
  slug?: string | null
  location?: string
  locationRef?: number | { id?: number }
  sharedNeighborhoods?: Array<number | { id?: number }>
  step1_complete?: boolean
  in_update_mode?: boolean
  step2_complete?: boolean
  step2_in_update_mode?: boolean
  step3_complete?: boolean
  step3_in_update_mode?: boolean
  header?: {
    intro?: PayloadRichText
    featuredImage?: number | { id?: number }
  }
  items?: Array<{
    id?: string
    blockType?: ItineraryBlockType
    item?: number | { id?: number }
    mediaMode?: MediaMode
    selectedPhotos?: Array<number | { id?: number }>
    selectedInstagramPost?: number | { id?: number } | null
    title?: string | null
    operator?: string | null
    price?: TourAgencyPriceTier | null
    url?: string | null
    tourDuration?: number | null
    startingPoint?: {
      label?: string | null
      latitude?: number | null
      longitude?: number | null
    } | null
    keyLocations?: Array<{
      id?: string
      source?: TourAgencyKeyLocationSource | null
      relatedItem?: PolymorphicRelatedItemValue | null
      title?: string | null
      latitude?: number | null
      longitude?: number | null
    }> | null
    image?: number | { id?: number } | null
    instagramPost?: number | { id?: number } | null
    blurb?: PayloadRichText
  }>
  seoSection?: {
    seoTitle?: string | null
    metaDescription?: string | null
    openGraph?: {
      title?: string | null
      description?: string | null
      imageUrl?: string | null
      url?: string | null
    } | null
    twitterCard?: {
      card?: SeoTwitterCardType | null
      title?: string | null
      description?: string | null
      imageUrl?: string | null
    } | null
    structuredData?: Record<string, unknown> | string | null
    robots?: {
      index?: 'index' | 'noindex' | null
      follow?: 'follow' | 'nofollow' | null
    } | null
  } | null
  author?: number | PayloadItineraryAuthor | null
  publishedAt?: string | null
  status?: 'draft' | 'published'
  articleType?: 'listicle-itinerary'
  updatedAt?: string
  createdAt?: string
}

export type PayloadListResponse<T> = {
  docs: T[]
  totalDocs: number
  totalPages?: number
}

export type LocationOption = {
  id: number
  locationKey: string
  country?: string
  city?: string | null
  neighborhood?: string | null
  level?: LocationLevel
  parentKey?: string | null
}

export type MediaAssetOption = {
  id: number
  filename: string
  alt?: string
  alt_text?: string
  altText?: string
  mediaSet?: number | string | { id?: number | string } | null
  url?: string
  variant?: string
}

export type GalleryMediaAsset = {
  id: number
  filename?: string | null
  url?: string | null
  alt_text?: string | null
}

export type GalleryImageObject = {
  id: number
  title?: string | null
  alt_text?: string | null
  variants?: {
    thumbnail?: number | GalleryMediaAsset | null
    square?: number | GalleryMediaAsset | null
    wide?: number | GalleryMediaAsset | null
    portrait?: number | GalleryMediaAsset | null
    editorial?: number | GalleryMediaAsset | null
  } | null
}

export type InstagramPreviewAsset = {
  id: number
  filename?: string | null
  url?: string | null
  alt_text?: string | null
}

export type InstagramPostOption = {
  id: number
  title: string
  status?: string | null
  embedCode?: string | null
  permalink?: string | null
  url?: string | null
  instagramUrl?: string | null
  shortcode?: string | null
  previewImage?: number | InstagramPreviewAsset | null
}

export type RelatedItemOption = {
  id: number
  title: string
  location?: string
  locationRef?: number | { id?: number } | null
  latitude?: number | string | null
  longitude?: number | string | null
  status?: string
  gallery?: Array<{
    image?: number | GalleryImageObject
  }>
  instagramGallery?: Array<{
    post?: number | InstagramPostOption
  }>
}

export function isRelatedItemCollection(value: unknown): value is RelatedItemCollection {
  return (
    value === 'dining'
    || value === 'accommodations'
    || value === 'attractions'
    || value === 'nightlife'
    || value === 'key-locations'
  )
}

export function isTourAgencyPriceTier(value: unknown): value is TourAgencyPriceTier {
  return (
    value === '$'
    || value === '$$'
    || value === '$$$'
    || value === '$$$$'
  )
}

export function relatedCollectionToBlockType(collection: RelatedItemCollection): ItineraryBlockType {
  switch (collection) {
    case 'dining':
      return 'itinerary-dining'
    case 'accommodations':
      return 'itinerary-accommodations'
    case 'attractions':
      return 'itinerary-attractions'
    case 'nightlife':
      return 'itinerary-nightlife'
    case 'key-locations':
      return 'itinerary-key-location'
  }
}
