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

export type PayloadRichText = Record<string, unknown>

export type ItineraryItemBlock = {
  id: string
  blockType: ItineraryBlockType
  item: number | null
  timeHour: number
  timeMinute: QuarterMinute
  timePeriod: Meridiem
  durationHours: number
  durationMinutes: DurationMinute
  blurbMarkdown: string
  blurbLexical?: PayloadRichText
  blurbJsonText?: string
}

export type SeoMetadataForm = {
  id?: number
  metaTitle: string
  metaDescription: string
  keywords: string
  ogTitle: string
  ogDescription: string
  ogImage: number | null
  canonicalUrl: string
  noIndex: boolean
  noFollow: boolean
  status: 'draft' | 'published'
}

export type ListicleItineraryDraft = {
  draftId: string
  payloadId?: number
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
  step1_complete: boolean
  in_update_mode: boolean
  header: {
    customTitle: string
    introMarkdown: string
    introLexical?: PayloadRichText
    introJsonText?: string
    featuredImage: number | null
  }
  items: ItineraryItemBlock[]
  seoSection: {
    seo: number | null
  }
  status: 'draft' | 'published'
  articleType: 'listicle-itinerary'
  updatedAt: string
}

export type PayloadItineraryDoc = {
  id: number
  title?: string
  location?: string
  locationRef?: number | { id?: number }
  dayAudience?: DayAudience
  itineraryStartHour?: number
  itineraryStartMinute?: QuarterMinute
  itineraryStartPeriod?: Meridiem
  itineraryEndHour?: number
  itineraryEndMinute?: QuarterMinute
  itineraryEndPeriod?: Meridiem
  step1_complete?: boolean
  in_update_mode?: boolean
  header?: {
    customTitle?: string
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
    blurb?: PayloadRichText
  }>
  seoSection?: {
    seo?: number | { id?: number }
  }
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

export type RelatedItemOption = {
  id: number
  title: string
  location?: string
  status?: string
}

export type SeoMetadataOption = {
  id: number
  metaTitle?: string
  metaDescription?: string
  status?: 'draft' | 'published'
}
