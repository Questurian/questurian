export type MediaMode = 'photos' | 'instagram' | 'both'

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

/**
 * Structural shape of a related-item used by the shared picker + media utils.
 * Each feature's full `RelatedItemOption` adds domain-specific fields (e.g. lat/lng,
 * idealFor) but assigns structurally to this base.
 */
export type RelatedItemMediaSource = {
  id: number
  title: string
  location?: string
  locationRef?: number | { id?: number } | null
  status?: string
  gallery?: Array<{
    image?: number | GalleryImageObject
  }>
  instagramGallery?: Array<{
    post?: number | InstagramPostOption
  }>
}
