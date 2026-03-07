import type { EditorAssistModelName } from '../staging/api'
import type { TripIntent } from '../trip-intent'

export type DayAudience = 'anyday' | 'weekday' | 'weekend'

export type ItineraryBlockType =
  | 'itinerary-dining'
  | 'itinerary-accommodations'
  | 'itinerary-attractions'
  | 'itinerary-nightlife'
  | 'itinerary-key-location'

export type Meridiem = 'AM' | 'PM'

export type QuarterMinute = '00' | '15' | '30' | '45'

export type DurationMinute = '0' | '15' | '30' | '45'

export type MediaMode = 'photos' | 'instagram' | 'both'

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
  timeHour: number
  timeMinute: QuarterMinute
  timePeriod: Meridiem
  durationHours: number
  durationMinutes: DurationMinute
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
  dayAudience: DayAudience | ''
  itineraryStartHour: number
  itineraryStartMinute: QuarterMinute
  itineraryStartPeriod: Meridiem
  itineraryEndHour: number
  itineraryEndMinute: QuarterMinute
  itineraryEndPeriod: Meridiem
  tripIntent?: TripIntent[]
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
  dayAudience?: DayAudience
  itineraryStartHour?: number
  itineraryStartMinute?: QuarterMinute
  itineraryStartPeriod?: Meridiem
  itineraryEndHour?: number
  itineraryEndMinute?: QuarterMinute
  itineraryEndPeriod?: Meridiem
  tripIntent?: TripIntent[]
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
    timeHour?: number
    timeMinute?: QuarterMinute
    timePeriod?: Meridiem
    durationHours?: number
    durationMinutes?: DurationMinute
    item?: number | { id?: number }
    mediaMode?: MediaMode
    selectedPhotos?: Array<number | { id?: number }>
    selectedInstagramPost?: number | { id?: number } | null
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
}

export type MediaAssetOption = {
  id: number
  filename: string
  alt?: string
  alt_text?: string
  altText?: string
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
  status?: string
  gallery?: Array<{
    image?: number | GalleryImageObject
  }>
  instagramGallery?: Array<{
    post?: number | InstagramPostOption
  }>
}
