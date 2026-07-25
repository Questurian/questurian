import type { LocationLevel } from '../../../shared/locationScope/types'
import type {
  GalleryImageObject,
  InstagramPostOption,
  LinkedTourOption,
  MediaMode
} from '../../../shared/builder/types'
import type { ItineraryBlockType } from './blockTypes'
import type { ListicleAngle } from './angles'
import type { ListTone } from './listTone'
import type { ItineraryMoment } from './moments'
import type { TourAgencyKeyLocationSource, TourAgencyPriceTier } from './tourAgency'
import type { SeoTwitterCardType } from './seo'
import type { PayloadRichText, PolymorphicRelatedItemValue } from './common'

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
  listTone?: ListTone
  generationBrief?: string | null
  planOverview?: string | null
  step1_complete?: boolean
  in_update_mode?: boolean
  step2_complete?: boolean
  step2_in_update_mode?: boolean
  step3_complete?: boolean
  step3_in_update_mode?: boolean
  header?: {
    intro?: PayloadRichText
    featuredMediaSet?: number | { id?: number }
    featuredImage?: number | { id?: number }
  }
  dayCount?: number
  itineraryDays?: Array<{
    id?: string
    whereStaying?: Array<{
      id?: string
      blockType?: ItineraryBlockType
      item?: number | { id?: number }
      tours?: Array<number | { id?: number }> | null
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
      angle?: ListicleAngle | null
      blurb?: PayloadRichText
    }>
    items?: Array<{
      id?: string
      blockType?: ItineraryBlockType
      item?: number | { id?: number }
      moment?: ItineraryMoment | null
      momentLabel?: string | null
      tours?: Array<number | { id?: number }> | null
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
      angle?: ListicleAngle | null
      blurb?: PayloadRichText
    }>
  }>
  /** @deprecated Prefer `itineraryDays`; migrated to day 1 server-side. */
  whereStaying?: Array<{
    id?: string
    blockType?: ItineraryBlockType
    item?: number | { id?: number }
    tours?: Array<number | { id?: number }> | null
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
    angle?: ListicleAngle | null
    blurb?: PayloadRichText
  }>
  items?: Array<{
    id?: string
    blockType?: ItineraryBlockType
    item?: number | { id?: number }
    moment?: ItineraryMoment | null
    momentLabel?: string | null
    tours?: Array<number | { id?: number }> | null
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
    angle?: ListicleAngle | null
    blurb?: PayloadRichText
    selectionReason?: string | null
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
  /** LM-linked tours; populated tour docs at fetch depth, the pickable pool for Tour Picks. */
  tours?: Array<number | LinkedTourOption>
}
