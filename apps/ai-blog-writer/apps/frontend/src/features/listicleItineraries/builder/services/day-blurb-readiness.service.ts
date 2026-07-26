import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  RelatedItemOption
} from '../../types'
import { getItineraryStopAngleDisabledReason } from './ai-autowrite.service'
import {
  getResolvedDayStops,
  resolveStopTitle
} from '../utils/itineraryStopBlock.utils'

type RelatedStopsByBlockType = Record<ItineraryBlockType, RelatedItemOption[]>

/**
 * Why day `dayIndex`'s blurbs cannot be composed, or undefined if it is ready.
 * Gated on: ≥1 resolved stop, every pooled-category stop having an Angle
 * (ADR 0010), and every resolved stop having a Selection reason (ADR 0020).
 * Intro is optional framing input; Step 2 lock state never blocks composition.
 */
export function getItineraryDayBlurbComposeDisabledReason(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: RelatedStopsByBlockType
): string | undefined {
  const day = draft.days[dayIndex]
  if (!day) return 'Day not found'

  const resolved = getResolvedDayStops(day, relatedByBlockType)
  if (resolved.length < 1) {
    return `Day ${dayIndex + 1}: add at least one resolved stop before composing blurbs`
  }
  for (const item of resolved) {
    const title = resolveStopTitle(item, relatedByBlockType)
    if (getItineraryStopAngleDisabledReason(item)) {
      return `Day ${dayIndex + 1}: select a blurb angle for "${title}"`
    }
    // Hard gate (ADR 0020): every resolved stop needs a Selection reason to seed
    // its blurb. Autobuild fills this for stops it picks; an empty reason means
    // an operator-added or swapped stop still needs a "Why this pick".
    if (!item.selectionReason?.trim()) {
      return `Day ${dayIndex + 1}: add a "Why this pick" for "${title}"`
    }
  }
  return undefined
}

/** True when every resolved stop in the day already has a blurb (write-all skips these). */
export function isDayBlurbsFullyComposed(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: RelatedStopsByBlockType
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
  relatedByBlockType: RelatedStopsByBlockType
): boolean {
  const day = draft.days[dayIndex]
  if (!day) return false
  return getResolvedDayStops(day, relatedByBlockType).some(
    (item) => item.blurbMarkdown.trim().length > 0
  )
}

/**
 * Day indexes the "write all" pass should compose: composable and not already
 * fully composed (auto-skip composed-clean days, ADR 0019).
 */
export function getComposableDayIndexes(
  draft: ListicleItineraryDraft,
  relatedByBlockType: RelatedStopsByBlockType
): number[] {
  const indexes: number[] = []
  for (let dayIndex = 0; dayIndex < draft.days.length; dayIndex += 1) {
    if (
      getItineraryDayBlurbComposeDisabledReason(
        draft,
        dayIndex,
        relatedByBlockType
      )
    )
      continue
    if (isDayBlurbsFullyComposed(draft, dayIndex, relatedByBlockType)) continue
    indexes.push(dayIndex)
  }
  return indexes
}

/**
 * Why a single stop's blurb cannot be composed on its own (ADR 0022), or
 * undefined when it is ready. Unlike the day-wide gate, siblings ride along as
 * read-only context and do not need to be ready themselves.
 */
export function getItineraryStopBlurbComposeDisabledReason(
  item: ItineraryItemBlock,
  relatedByBlockType: RelatedStopsByBlockType
): string | undefined {
  const title = resolveStopTitle(item, relatedByBlockType)
  if (!title) {
    return 'Resolve this stop (pick or name it) before composing its blurb'
  }
  if (getItineraryStopAngleDisabledReason(item)) {
    return `Select a blurb angle for "${title}"`
  }
  if (!item.selectionReason?.trim()) {
    return `Add a "Why this pick" for "${title}"`
  }
  return undefined
}

/**
 * True when authoring only `itemId` would leave a sibling's already-written
 * handoff stale (ADR 0022). Appending at the end strands nothing.
 */
export function itineraryStopBlurbWriteStrandsNeighbor(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  itemId: string,
  relatedByBlockType: RelatedStopsByBlockType
): boolean {
  const day = draft.days[dayIndex]
  if (!day) return false
  const resolved = getResolvedDayStops(day, relatedByBlockType)
  const position = resolved.findIndex((stop) => stop.id === itemId)
  if (position < 0 || position === resolved.length - 1) return false
  return resolved.some(
    (stop) => stop.id !== itemId && stop.blurbMarkdown.trim().length > 0
  )
}
