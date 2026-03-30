import type { EditorAssistModelName } from '../staging/api'
import type { SeoSection, SeoTwitterCardType } from '../shared/seo/types'
import type { TripIntent } from '../trip-intent'
import type { LocationLevel } from '../locationScope/types'

export type ListicleType = 'dining' | 'accommodations' | 'attractions' | 'nightlife'

export type ListicleBlockType =
  | 'data-dining'
  | 'data-accommodations'
  | 'data-attractions'
  | 'data-nightlife'

export type MediaMode = 'photos' | 'instagram' | 'both'

export type PayloadRichText = Record<string, unknown>

export type { SeoSection, SeoTwitterCardType } from '../shared/seo/types'

export type ListicleItemBlock = {
  id: string
  blockType: ListicleBlockType
  item: number | null
  mediaMode: MediaMode
  selectedPhotos: number[]
  selectedInstagramPost: number | null
  blurbMarkdown: string
  blurbLexical?: PayloadRichText
  blurbJsonText?: string
}

export type SingleTypeListicleDraft = {
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
  listicleType: ListicleType | ''
  /** 0 means "unset"; valid configured range is 1..50 */
  targetItemCount: number
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
  items: ListicleItemBlock[]
  seoSection: SeoSection
  status: 'draft' | 'published'
  articleType: 'single-type-listicle'
  updatedAt: string
}

export type PayloadListicleAuthor = {
  id?: number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

export type PayloadListicleDoc = {
  id: number
  title?: string
  slug?: string | null
  location?: string
  locationRef?: number | { id?: number }
  sharedNeighborhoods?: Array<number | { id?: number }>
  listicleType?: ListicleType
  targetItemCount?: number
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
    blockType?: ListicleBlockType
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
  author?: number | PayloadListicleAuthor | null
  publishedAt?: string | null
  status?: 'draft' | 'published'
  articleType?: 'single-type-listicle'
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

/** A single media-asset variant, returned when depth >= 2 expands media-sets.variants.* */
export type GalleryMediaAsset = {
  id: number
  filename?: string | null
  url?: string | null
  alt_text?: string | null
}

/**
 * A `media-set` object as returned by Payload with depth=2.
 * The gallery field in dining/accommodations/etc. relates to media-sets,
 * each of which holds per-crop variant assets (thumbnail, square, wide, …).
 */
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

/** A `media-asset` returned when depth=2 expands InstagramPost.previewImage */
export type InstagramPreviewAsset = {
  id: number
  filename?: string | null
  url?: string | null
  alt_text?: string | null
}

/** An `instagram-posts` document as returned at depth=1/2 */
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
  status?: string
  idealFor?: string[]
  gallery?: Array<{
    image?: number | GalleryImageObject
  }>
  instagramGallery?: Array<{
    post?: number | InstagramPostOption
  }>
}
