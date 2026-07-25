import type { EditorAssistModelName } from '../../staging/api'
import type { MediaMode } from '../../../shared/builder/types'
import type { PayloadSyncStateFields } from '../../../shared/payloadSync/draftPayloadSync'
import { isManualItineraryBlockType, type ItineraryBlockType } from './blockTypes'
import type { ListicleAngle } from './angles'
import type { ListTone } from './listTone'
import type { TravelerProfile } from './travelerProfile'
import type { ItineraryMoment } from './moments'
import type { DayShellSelection, DayShellTemplate, ShellSlotDaypart } from './dayShells'
import type {
  TourAgencyKeyLocationRow,
  TourAgencyPriceTier,
  TourAgencyStartingPoint
} from './tourAgency'
import type { SeoSection } from './seo'
import type { PayloadRichText } from './common'

export type ItineraryItemBlock = {
  id: string
  blockType: ItineraryBlockType
  item: number | null
  moment?: ItineraryMoment | null
  momentLabel?: string
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

export type ItineraryDaySlice = {
  id: string
  whereStaying: ItineraryItemBlock[]
  items: ItineraryItemBlock[]
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

/**
 * A stable key for a stop's *resolved identity* — the venue it points at.
 * Pooled stops are keyed by their Payload record; the lone manual block type
 * (tour-agency) by its operator-entered title/operator. When this key changes
 * (a swap), the stop's Selection reason and blurb describe the previous venue
 * and must be invalidated (ADR 0020).
 */
export function resolveItineraryStopIdentityKey(
  item: ItineraryItemBlock
): string {
  if (isManualItineraryBlockType(item.blockType)) {
    return `${item.blockType}|manual|${item.title.trim()}|${item.operator.trim()}`
  }
  return `${item.blockType}|${item.item ?? ''}`
}

/** Lodging rows first, then stops, Day1→DayN (matches Payload `itineraryDays` order). */
export function getItineraryBlocksInArticleOrder(
  draft: ListicleItineraryDraft
): ItineraryItemBlock[] {
  return draft.days.flatMap((day) => [...day.whereStaying, ...day.items])
}

export function findItineraryItemById(
  draft: ListicleItineraryDraft,
  itemId: string
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

export function createEmptyDaySlice(): ItineraryDaySlice {
  return {
    id: `day_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    whereStaying: [],
    items: []
  }
}

export function resizeItineraryDays(
  draft: ListicleItineraryDraft,
  nextCount: number
): ListicleItineraryDraft {
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
    days: nextDays
  }
}
