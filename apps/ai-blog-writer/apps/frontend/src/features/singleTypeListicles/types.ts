import type { EditorAssistModelName } from '../staging/api'

export type ListicleType = 'dining' | 'accommodations' | 'attractions' | 'nightlife'

export type ListicleBlockType =
  | 'data-dining'
  | 'data-accommodations'
  | 'data-attractions'
  | 'data-nightlife'

export type MediaMode = 'photos' | 'instagram' | 'both'

export type PayloadRichText = Record<string, unknown>

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

export type SingleTypeListicleDraft = {
  draftId: string
  payloadId?: number
  editorModelName: EditorAssistModelName
  title: string
  location: string
  locationRef: number | null
  listicleType: ListicleType | ''
  targetItemCount: number
  step1_complete: boolean
  in_update_mode: boolean
  header: {
    introMarkdown: string
    introLexical?: PayloadRichText
    introJsonText?: string
    featuredImage: number | null
  }
  items: ListicleItemBlock[]
  seoSection: {
    seo: number | null
  }
  status: 'draft' | 'published'
  articleType: 'single-type-listicle'
  updatedAt: string
}

export type PayloadListicleDoc = {
  id: number
  title?: string
  location?: string
  locationRef?: number | { id?: number }
  listicleType?: ListicleType
  targetItemCount?: number
  step1_complete?: boolean
  in_update_mode?: boolean
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
    seo?: number | { id?: number }
  }
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

export type SeoMetadataOption = {
  id: number
  metaTitle?: string
  metaDescription?: string
  status?: 'draft' | 'published'
}
