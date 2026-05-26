import type { EditorAssistModelName } from '../staging/api'
import type { SeoSection, SeoTwitterCardType } from '../../shared/seo/types'
import type { LocationLevel } from '../../shared/locationScope/types'
import type {
  GalleryImageObject,
  InstagramPostOption,
  MediaMode,
} from '../../shared/builder/types'

export type ListicleType = 'dining' | 'accommodations' | 'attractions' | 'nightlife'

export type ListicleAngle =
  | 'signature-dish'
  | 'atmosphere'
  | 'founders-backstory'
  | 'insider-tip'
  | 'best-for'
  | 'whats-different'
  | 'best-for-night'

export type ListicleAngleOption = { value: ListicleAngle; label: string }

export const DINING_LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> = [
  { value: 'signature-dish', label: 'Signature Dish' },
  { value: 'atmosphere', label: 'Atmosphere' },
  { value: 'founders-backstory', label: 'Founders / Backstory' },
  { value: 'insider-tip', label: 'Insider Tip' },
  { value: 'best-for', label: 'Best-For' },
  { value: 'whats-different', label: "What's Different" },
]

export const NIGHTLIFE_LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> = [
  { value: 'best-for-night', label: 'Best For Night' },
]

/** Single-angle nightlife pool per ADR 0008. Operator picks (or default). */
export const NIGHTLIFE_DEFAULT_ANGLE: ListicleAngle = 'best-for-night'

export const LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> = [
  ...DINING_LISTICLE_ANGLE_OPTIONS,
  ...NIGHTLIFE_LISTICLE_ANGLE_OPTIONS,
]

export function getListicleAngleOptions(listicleType: ListicleType | ''): ReadonlyArray<ListicleAngleOption> {
  if (listicleType === 'nightlife') return NIGHTLIFE_LISTICLE_ANGLE_OPTIONS
  if (listicleType === 'dining') return DINING_LISTICLE_ANGLE_OPTIONS
  return []
}

export function resolveListicleAngle(value: unknown): ListicleAngle | null {
  if (typeof value !== 'string') return null
  if (LISTICLE_ANGLE_OPTIONS.some((opt) => opt.value === value)) {
    return value as ListicleAngle
  }
  return null
}

/**
 * Per-blockType coercion. Nightlife items always resolve to best-for-night
 * because the pool is single-angle (ADR 0008); legacy values like 'room-feel'
 * or 'order-timing-tip' from older drafts are normalized here on read so the
 * operator does not have to re-pick an angle on every existing item.
 */
export function resolveListicleAngleForBlockType(
  blockType: ListicleBlockType | undefined,
  value: unknown,
): ListicleAngle | null {
  if (blockType === 'data-nightlife') return NIGHTLIFE_DEFAULT_ANGLE
  return resolveListicleAngle(value)
}

export type ListTone =
  | 'elevated'
  | 'casual'
  | 'hidden-gem'
  | 'family-friendly'
  | 'date-night'
  | 'budget'

export const LIST_TONE_OPTIONS: ReadonlyArray<{ value: ListTone; label: string; description: string }> = [
  { value: 'elevated', label: 'Elevated', description: 'Polished, refined, slightly formal' },
  { value: 'casual', label: 'Casual', description: 'Friendly, conversational, easygoing' },
  { value: 'hidden-gem', label: 'Hidden Gem', description: 'Off-the-radar, insider, discovery-led' },
  { value: 'family-friendly', label: 'Family-Friendly', description: 'Warm, practical, kid-aware' },
  { value: 'date-night', label: 'Date Night', description: 'Intimate, atmospheric, romantic' },
  { value: 'budget', label: 'Budget', description: 'Value-focused, practical, accessible' },
]

export const DEFAULT_LIST_TONE: ListTone = 'elevated'

export function resolveListTone(value: unknown): ListTone {
  if (typeof value !== 'string') return DEFAULT_LIST_TONE
  if (LIST_TONE_OPTIONS.some((opt) => opt.value === value)) {
    return value as ListTone
  }
  return DEFAULT_LIST_TONE
}

export type ListicleBlockType =
  | 'data-dining'
  | 'data-accommodations'
  | 'data-attractions'
  | 'data-nightlife'

export type PayloadRichText = Record<string, unknown>

export type {
  GalleryImageObject,
  GalleryMediaAsset,
  InstagramPostOption,
  InstagramPreviewAsset,
  MediaAssetOption,
  MediaMode,
} from '../../shared/builder/types'

export type { SeoSection, SeoTwitterCardType } from '../../shared/seo/types'

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
  /** Operator-selected angle; null = unselected and generation is blocked (ADR 0010). */
  angle?: ListicleAngle | null
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
  listTone: ListTone
  title: string
  location: string
  locationRef: number | null
  sharedNeighborhoods: number[]
  listicleType: ListicleType | ''
  /** 0 means "unset"; valid configured range is 1..50 */
  targetItemCount: number
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
  listTone?: ListTone
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
    angle?: ListicleAngle | null
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
