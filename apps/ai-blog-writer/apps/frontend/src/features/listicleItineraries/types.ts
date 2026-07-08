import type { EditorAssistModelName } from '../staging/api'
import type { LocationLevel } from '../../shared/locationScope/types'
import type {
  GalleryImageObject,
  InstagramPostOption,
  LinkedTourOption,
  MediaMode,
} from '../../shared/builder/types'
import type { PayloadSyncStateFields } from '../../shared/payloadSync/draftPayloadSync'

export type {
  GalleryImageObject,
  GalleryMediaAsset,
  InstagramPostOption,
  InstagramPreviewAsset,
  LinkedTourOption,
  MediaAssetOption,
  MediaMode,
} from '../../shared/builder/types'
export { TOUR_PICKS_MAX } from '../../shared/builder/types'

export type ItineraryBlockType =
  | 'itinerary-dining'
  | 'itinerary-accommodations'
  | 'itinerary-where-staying'
  | 'itinerary-attractions'
  | 'itinerary-nightlife'
  | 'itinerary-key-location'
  | 'itinerary-tour-agency'

export const TOUR_AGENCY_BLOCK_TYPE = 'itinerary-tour-agency'

export function isManualItineraryBlockType(blockType: ItineraryBlockType): boolean {
  return blockType === TOUR_AGENCY_BLOCK_TYPE
}

export const WHERE_STAYING_BLOCK_TYPE = 'itinerary-where-staying' as const

export function isWhereStayingBlockType(blockType: ItineraryBlockType): boolean {
  return blockType === WHERE_STAYING_BLOCK_TYPE
}

/**
 * A stable key for a stop's *resolved identity* — the venue it points at.
 * Pooled stops are keyed by their Payload record; the lone manual block type
 * (tour-agency) by its operator-entered title/operator. When this key changes
 * (a swap), the stop's Selection reason and blurb describe the previous venue
 * and must be invalidated (ADR 0020).
 */
export function resolveItineraryStopIdentityKey(item: ItineraryItemBlock): string {
  if (isManualItineraryBlockType(item.blockType)) {
    return `${item.blockType}|manual|${item.title.trim()}|${item.operator.trim()}`
  }
  return `${item.blockType}|${item.item ?? ''}`
}

/**
 * Per-item editorial angle + list tone for itinerary stops.
 *
 * These mirror the single-type listicle pools: each itinerary stop reuses the
 * angle pool of its category (dining/nightlife/accommodations/attractions),
 * and the itinerary carries one List Tone for every blurb and the intro.
 * `key-location` (no pool yet) and `tour-agency` (manual stop) carry no angle.
 * The backend (`editor_assist/listicle_writer.py`) owns the actual angle/tone
 * prompt guidance; these are only the operator-facing vocabulary.
 */
export type ListicleAngle =
  | 'signature-dish'
  | 'atmosphere'
  | 'founders-backstory'
  | 'insider-tip'
  | 'best-for'
  | 'whats-different'
  | 'best-for-night'
  | 'location-and-setting'
  | 'view-and-vista'
  | 'design-and-aesthetic'
  | 'signature-amenity'
  | 'food-and-beverage'
  | 'trip-fit'
  | 'property-backstory'
  | 'booking-tip'
  | 'signature-feature'
  | 'setting'
  | 'history-built'
  | 'visit-time-tip'
  | 'best-for-visit-type'

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

export const ACCOMMODATIONS_LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> = [
  { value: 'location-and-setting', label: 'Location & Setting' },
  { value: 'view-and-vista', label: 'View & Vista' },
  { value: 'design-and-aesthetic', label: 'Design & Aesthetic' },
  { value: 'signature-amenity', label: 'Signature Amenity' },
  { value: 'food-and-beverage', label: 'Food & Beverage' },
  { value: 'trip-fit', label: 'Trip Fit' },
  { value: 'property-backstory', label: 'Property Backstory' },
  { value: 'booking-tip', label: 'Booking Tip' },
  { value: 'whats-different', label: "What's Different" },
]

export const ATTRACTIONS_LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> = [
  { value: 'signature-feature', label: 'Signature Feature' },
  { value: 'setting', label: 'Setting' },
  { value: 'history-built', label: 'History / Built' },
  { value: 'visit-time-tip', label: 'Visit-Time Tip' },
  { value: 'best-for-visit-type', label: 'Best For Visit Type' },
  { value: 'whats-different', label: "What's Different" },
]

/** Single-angle nightlife pool per ADR 0008; operator never has to pick. */
export const NIGHTLIFE_DEFAULT_ANGLE: ListicleAngle = 'best-for-night'

export const LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> = [
  ...DINING_LISTICLE_ANGLE_OPTIONS,
  ...NIGHTLIFE_LISTICLE_ANGLE_OPTIONS,
  ...ACCOMMODATIONS_LISTICLE_ANGLE_OPTIONS,
  ...ATTRACTIONS_LISTICLE_ANGLE_OPTIONS,
]

/**
 * The angle pool offered for a stop, keyed off its block type's category.
 * `key-location` (no pool yet) and `tour-agency` (manual stop, driven by its
 * structured fields) intentionally return no angles.
 */
export function getItineraryAngleOptions(
  blockType: ItineraryBlockType,
): ReadonlyArray<ListicleAngleOption> {
  switch (blockType) {
    case 'itinerary-dining':
      return DINING_LISTICLE_ANGLE_OPTIONS
    case 'itinerary-nightlife':
      return NIGHTLIFE_LISTICLE_ANGLE_OPTIONS
    case 'itinerary-accommodations':
    case 'itinerary-where-staying':
      return ACCOMMODATIONS_LISTICLE_ANGLE_OPTIONS
    case 'itinerary-attractions':
      return ATTRACTIONS_LISTICLE_ANGLE_OPTIONS
    case 'itinerary-key-location':
    case 'itinerary-tour-agency':
    default:
      return []
  }
}

export function resolveListicleAngle(value: unknown): ListicleAngle | null {
  if (typeof value !== 'string') return null
  if (LISTICLE_ANGLE_OPTIONS.some((opt) => opt.value === value)) {
    return value as ListicleAngle
  }
  return null
}

/**
 * Per-blockType coercion. Nightlife stops always resolve to best-for-night
 * because the pool is single-angle (ADR 0008). Stops with no pool
 * (`key-location`, `tour-agency`) always resolve to null. Other categories
 * keep the operator's selection if it is a valid angle, else null.
 */
export function resolveItineraryAngleForBlockType(
  blockType: ItineraryBlockType,
  value: unknown,
): ListicleAngle | null {
  if (blockType === 'itinerary-nightlife') return NIGHTLIFE_DEFAULT_ANGLE
  if (getItineraryAngleOptions(blockType).length === 0) return null
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

/** Lodging rows first, then stops, Day1→DayN (matches Payload `itineraryDays` order). */
export function getItineraryBlocksInArticleOrder(draft: ListicleItineraryDraft): ItineraryItemBlock[] {
  return draft.days.flatMap((day) => [...day.whereStaying, ...day.items])
}

export type TravelerProfileBudget = '' | '$' | '$$' | '$$$' | '$$$$'

/**
 * Traveler Profile: structured description of the intended traveler, used to
 * AI-compose the Generation Brief. ABW-only planning state; not synced to
 * Payload. The free-text Generation Brief stays the only Autobuild input.
 */
export type TravelerProfile = {
  travelerTypes: string[]
  motivations: string[]
  interests: string[]
  budget: TravelerProfileBudget
  accommodations: string[]
  practicalNeeds: string[]
  notes: string
  /** Last composed paragraph applied to the Generation Brief; a differing
   * non-empty brief means the operator hand-edited it since (confirm before
   * replacing). */
  composedBrief: string
}

export function createEmptyTravelerProfile(): TravelerProfile {
  return {
    travelerTypes: [],
    motivations: [],
    interests: [],
    budget: '',
    accommodations: [],
    practicalNeeds: [],
    notes: '',
    composedBrief: '',
  }
}

export function isTravelerProfileEmpty(profile: TravelerProfile): boolean {
  return (
    profile.travelerTypes.length === 0
    && profile.motivations.length === 0
    && profile.interests.length === 0
    && !profile.budget
    && profile.accommodations.length === 0
    && profile.practicalNeeds.length === 0
    && !profile.notes.trim()
  )
}

export function findItineraryItemById(
  draft: ListicleItineraryDraft,
  itemId: string,
): { dayIndex: number; item: ItineraryItemBlock } | null {
  for (let dayIndex = 0; dayIndex < draft.days.length; dayIndex += 1) {
    const day = draft.days[dayIndex]
    const ws = day.whereStaying.find((row) => row.id === itemId)
    if (ws) return { dayIndex, item: ws }
    const st = day.items.find((row) => row.id === itemId)
    if (st) return { dayIndex, item: st }
  }
  return null
}

export type ItineraryDaySlice = {
  id: string
  whereStaying: ItineraryItemBlock[]
  items: ItineraryItemBlock[]
}

export function createEmptyDaySlice(): ItineraryDaySlice {
  return {
    id: `day_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    whereStaying: [],
    items: [],
  }
}

export function resizeItineraryDays(draft: ListicleItineraryDraft, nextCount: number): ListicleItineraryDraft {
  const clamped = Math.max(1, Math.min(7, Math.floor(nextCount)))
  const nextDays = [...draft.days]
  while (nextDays.length < clamped) {
    nextDays.push(createEmptyDaySlice())
  }
  if (nextDays.length > clamped) {
    nextDays.splice(clamped)
  }
  return {
    ...draft,
    dayCount: clamped,
    days: nextDays,
  }
}

export type RelatedItemCollection =
  | 'dining'
  | 'accommodations'
  | 'attractions'
  | 'nightlife'
  | 'key-locations'

export type DayShellId = string

export type ShellSlotDaypart =
  | 'morning'
  | 'late_morning'
  | 'lunch'
  | 'afternoon'
  | 'dinner'
  | 'evening'
  | 'nightlife'

export type ShellSlotCollection = 'dining' | 'accommodations' | 'attractions' | 'nightlife'

export type DayShellSlot = {
  id: string
  label: string
  daypart: ShellSlotDaypart
  acceptableCollections: ShellSlotCollection[]
  preferredCollections: ShellSlotCollection[]
  intentTags: string[]
  avoidTags?: string[]
}

export type DayShellTemplate = {
  id: DayShellId
  name: string
  description: string
  slots: DayShellSlot[]
}

export type DayShellSelection = {
  dayId: string
  shellId: DayShellId
}

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
  /**
   * Tour Picks (ADR 0013): operator-curated, ordered subset (max 4) of the
   * selected attraction's LM-linked tours. Only meaningful for
   * `itinerary-attractions`; cleared when the attraction changes.
   */
  tours: number[]
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
  /**
   * Operator-selected blurb angle for this stop, scoped to the block type's
   * category pool. null = unselected; for pooled categories this blocks the
   * stop's auto-write (ADR 0010). Always null for `key-location`/`tour-agency`.
   */
  angle?: ListicleAngle | null
  blurbMarkdown: string
  blurbLexical?: PayloadRichText
  blurbJsonText?: string
  /**
   * Internal AI rationale for why this record filled this slot, produced by
   * Itinerary Autobuild. Operator-editable, not public; seeds the blurb writer.
   */
  selectionReason?: string
  /** ABW-only Day Shell slot metadata; not synced to Payload CMS. */
  shellSlotId?: string
  shellSlotLabel?: string
  shellSlotDaypart?: ShellSlotDaypart
}

export type ListicleItineraryDraft = PayloadSyncStateFields & {
  draftId: string
  payloadId?: number
  payloadStatus?: 'draft' | 'published'
  payloadSlug?: string
  payloadPublishedAt?: string
  payloadUpdatedAt?: string
  payloadAuthorName?: string
  editorModelName: EditorAssistModelName
  /** One editorial register for every blurb and the intro in this itinerary. */
  listTone: ListTone
  /** Itinerary Autobuild: the operator's creative brief (internal, persisted). */
  generationBrief?: string
  /** Traveler Profile: structured brief-composer selections; ABW-only. */
  travelerProfile?: TravelerProfile
  /** Itinerary Autobuild: whole-trip Lodging Anchor on day 1. Operator decision;
   * missing means true (default on) so older drafts keep lodging. ABW-local. */
  includeLodging?: boolean
  /** Itinerary Autobuild: trip-level rationale for the plan (internal, persisted). */
  planOverview?: string
  /** Itinerary Autobuild: selected Day Shell per local day; ABW-only planning state. */
  dayShellSelections?: DayShellSelection[]
  /** Operator-created Day Shell layouts; ABW-only local planning state. */
  customDayShells?: DayShellTemplate[]
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
    featuredMediaSet?: number | null
    featuredImage: number | null
  }
  /** 1–7; always equals `days.length`. */
  dayCount: number
  /** One entry per itinerary day; order is Day 1 … Day N. */
  days: ItineraryDaySlice[]
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
