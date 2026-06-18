import type {
  ComposeDayBlurbsNeighborStop,
  ComposeDayBlurbsRequest,
  ComposeDayBlurbsResponse,
  ComposeDayBlurbStop,
} from '../../../staging/api'
import type {
  ItineraryBlockType,
  ItineraryDaySlice,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import {
  isManualItineraryBlockType,
  resolveItineraryAngleForBlockType,
} from '../../types'
import { getItineraryStopAngleDisabledReason } from './ai-autowrite.service'
import { buildArticleLocationLabel } from './ai-autowrite.service'
import { getItineraryAiArticleTitle } from './ai-rewrite.service'

export const ITINERARY_BLOCK_CATEGORY_LABELS: Record<ItineraryBlockType, string> = {
  'itinerary-dining': 'Dining',
  'itinerary-accommodations': 'Accommodations',
  'itinerary-where-staying': "Where You're Staying",
  'itinerary-attractions': 'Attractions',
  'itinerary-nightlife': 'Nightlife',
  'itinerary-key-location': 'Key Location',
  'itinerary-tour-agency': 'Tour Agency',
}

/** True only when the intro has been finalized (Step 2 locked, ADR 0019). */
function isIntroFinalized(draft: ListicleItineraryDraft): boolean {
  return Boolean(
    draft.step2_complete
    && !draft.step2_in_update_mode
    && draft.header.introMarkdown.trim(),
  )
}

export function resolveStopTitle(
  item: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string {
  if (isManualItineraryBlockType(item.blockType)) {
    return item.title.trim() || item.operator.trim()
  }
  if (!item.item) return ''
  const relatedOptions = relatedByBlockType[item.blockType] || []
  return relatedOptions.find((entry) => entry.id === item.item)?.title?.trim() || ''
}

/** Lodging rows first, then stops — matches the per-day article order. */
function getDayBlocksInArticleOrder(day: ItineraryDaySlice): ItineraryItemBlock[] {
  return [...day.whereStaying, ...day.items]
}

/**
 * Day stops that have a resolved identity, in article order. These are the
 * stops the day composer writes against; unresolved slots are skipped, the same
 * way the intro composer skips them.
 */
function getResolvedDayStops(
  day: ItineraryDaySlice,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): ItineraryItemBlock[] {
  return getDayBlocksInArticleOrder(day).filter(
    (item) => Boolean(resolveStopTitle(item, relatedByBlockType)),
  )
}

function toComposeStop(
  item: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): ComposeDayBlurbStop {
  return {
    targetId: `${item.id}_blurb`,
    title: resolveStopTitle(item, relatedByBlockType),
    category: ITINERARY_BLOCK_CATEGORY_LABELS[item.blockType],
    daypart: item.shellSlotDaypart,
    angle: resolveItineraryAngleForBlockType(item.blockType, item.angle),
    selectionReason: item.selectionReason?.trim() || undefined,
  }
}

function toNeighborStop(
  item: ItineraryItemBlock | undefined,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): ComposeDayBlurbsNeighborStop | undefined {
  if (!item) return undefined
  const title = resolveStopTitle(item, relatedByBlockType)
  if (!title) return undefined
  return { title, category: ITINERARY_BLOCK_CATEGORY_LABELS[item.blockType] }
}

/**
 * Why day `dayIndex`'s blurbs cannot be composed, or undefined if it is ready.
 * Gated on: a finalized Intro (Step 2 locked, ADR 0019), ≥1 resolved stop, every
 * pooled-category stop having an Angle (ADR 0010 preserved), and every resolved
 * stop having a Selection reason to seed its blurb (ADR 0020).
 */
export function getItineraryDayBlurbComposeDisabledReason(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string | undefined {
  if (!isIntroFinalized(draft)) {
    return 'Lock the intro in Step 2 before composing day blurbs'
  }
  const day = draft.days[dayIndex]
  if (!day) return 'Day not found'

  const resolved = getResolvedDayStops(day, relatedByBlockType)
  if (resolved.length < 1) {
    return `Day ${dayIndex + 1}: add at least one resolved stop before composing blurbs`
  }
  for (const item of resolved) {
    if (getItineraryStopAngleDisabledReason(item)) {
      return `Day ${dayIndex + 1}: select a blurb angle for "${resolveStopTitle(item, relatedByBlockType)}"`
    }
    // Hard gate (ADR 0020): every resolved stop needs a Selection reason to seed
    // its blurb. Autobuild fills this for stops it picks; an empty reason means
    // an operator-added or swapped stop still needs a "Why this pick".
    if (!item.selectionReason?.trim()) {
      return `Day ${dayIndex + 1}: add a "Why this pick" for "${resolveStopTitle(item, relatedByBlockType)}"`
    }
  }
  return undefined
}

/** True when every resolved stop in the day already has a blurb (write-all skips these). */
export function isDayBlurbsFullyComposed(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): boolean {
  const day = draft.days[dayIndex]
  if (!day) return false
  const resolved = getResolvedDayStops(day, relatedByBlockType)
  if (resolved.length < 1) return false
  return resolved.every((item) => item.blurbMarkdown.trim().length > 0)
}

/** True when any resolved stop in the day already has a blurb (whole-day regen overwrites these → confirm). */
export function dayHasExistingBlurbs(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): boolean {
  const day = draft.days[dayIndex]
  if (!day) return false
  return getResolvedDayStops(day, relatedByBlockType).some(
    (item) => item.blurbMarkdown.trim().length > 0,
  )
}

/**
 * Day indexes the "write all" pass should compose: composable and not already
 * fully composed (auto-skip composed-clean days, ADR 0019).
 */
export function getComposableDayIndexes(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): number[] {
  const indexes: number[] = []
  for (let dayIndex = 0; dayIndex < draft.days.length; dayIndex += 1) {
    if (getItineraryDayBlurbComposeDisabledReason(draft, dayIndex, relatedByBlockType)) continue
    if (isDayBlurbsFullyComposed(draft, dayIndex, relatedByBlockType)) continue
    indexes.push(dayIndex)
  }
  return indexes
}

export function buildItineraryComposeDayBlurbsRequest(params: {
  draft: ListicleItineraryDraft
  dayIndex: number
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  locations: LocationOption[]
  modelName: ComposeDayBlurbsRequest['modelName']
}): ComposeDayBlurbsRequest {
  const { draft, dayIndex, relatedByBlockType, locations, modelName } = params
  const day = draft.days[dayIndex]

  const prevDay = draft.days[dayIndex - 1]
  const nextDay = draft.days[dayIndex + 1]
  const prevResolved = prevDay ? getResolvedDayStops(prevDay, relatedByBlockType) : []
  const nextResolved = nextDay ? getResolvedDayStops(nextDay, relatedByBlockType) : []

  return {
    articleTitle: getItineraryAiArticleTitle(draft),
    locationLabel: buildArticleLocationLabel(draft, locations),
    listTone: draft.listTone,
    planOverview: draft.planOverview?.trim() || undefined,
    intro: draft.header.introMarkdown.trim() || undefined,
    dayLabel: `Day ${dayIndex + 1}`,
    dayCount: draft.days.length || undefined,
    prevDayLastStop: toNeighborStop(prevResolved[prevResolved.length - 1], relatedByBlockType),
    nextDayFirstStop: toNeighborStop(nextResolved[0], relatedByBlockType),
    modelName,
    stops: getResolvedDayStops(day, relatedByBlockType).map((item) =>
      toComposeStop(item, relatedByBlockType),
    ),
  }
}

/** Apply composed blurbs for one day; only `generated` results land. */
export function applyItineraryComposedDayBlurbs(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  response: ComposeDayBlurbsResponse,
): ListicleItineraryDraft {
  const applyToRow = (item: ItineraryItemBlock): ItineraryItemBlock => {
    const result = response.results[`${item.id}_blurb`]
    if (result?.status !== 'generated' || !result.markdown) return item
    return { ...item, blurbMarkdown: result.markdown, blurbJsonText: '' }
  }

  return {
    ...draft,
    days: draft.days.map((day, index) => {
      if (index !== dayIndex) return day
      return {
        ...day,
        whereStaying: day.whereStaying.map(applyToRow),
        items: day.items.map(applyToRow),
      }
    }),
  }
}
