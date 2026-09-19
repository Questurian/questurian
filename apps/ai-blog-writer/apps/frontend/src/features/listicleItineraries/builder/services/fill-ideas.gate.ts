import type {
  ItineraryBlockType,
  ItineraryDaySlice,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  RelatedItemOption,
} from '../../types'
import { isManualItineraryBlockType } from '../../types'
import { validateStep1 } from '../validators/setup.validators'

/**
 * Who is allowed to ask for a day's fill-in ideas, and why not.
 *
 * Three rules, in the order an operator hits them:
 *
 * 1. **The setup has to be finished.** Nothing below means anything without a
 *    place, a length and a shape for each day.
 * 2. **Day 1 has to have somewhere to stay.** A day is a route, and a route
 *    starts at the hotel; without one the model is inventing the starting point
 *    and every distance it reasons about afterwards is measured from nowhere.
 * 3. **Days run in order.** Day 3 cannot be asked until Day 2 has been, because
 *    the whole reason the trip is split into per-day calls is so each one can be
 *    told what the earlier ones already used. Ask them out of order and the
 *    overlap this feature exists to prevent comes straight back.
 *
 * Only Day 1 is *required* to carry lodging. A later day may add its own — that
 * is how a transfer day says "they sleep somewhere new tonight" — and a day
 * with none inherits the most recent one before it.
 */

export type FillIdeasDayGate =
  | { canRun: true; reason?: undefined }
  | { canRun: false; reason: string }

/** The resolved place behind a stop, or '' when the slot is still empty. */
export function resolveFillSlotTitle(
  item: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string {
  if (isManualItineraryBlockType(item.blockType)) return item.title.trim()
  if (item.item === null) return ''
  const options = relatedByBlockType[item.blockType] ?? []
  return options.find((option) => option.id === item.item)?.title.trim() ?? ''
}

function dayLodgingTitles(
  day: ItineraryDaySlice | undefined,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string[] {
  if (!day) return []
  return day.whereStaying
    .map((item) => resolveFillSlotTitle(item, relatedByBlockType))
    .filter(Boolean)
}

/**
 * Where this day is based: its own lodging, or the last one set before it.
 *
 * Returns `null` only when no day up to and including this one has any — which
 * `getFillIdeasDayGate` already refuses, so a caller past the gate always has a
 * base for Day 1 onwards.
 */
export function resolveFillIdeasDayBase(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): { title: string; fromDayIndex: number } | null {
  for (let index = Math.min(dayIndex, draft.days.length - 1); index >= 0; index -= 1) {
    const titles = dayLodgingTitles(draft.days[index], relatedByBlockType)
    if (titles.length) return { title: titles.join(' / '), fromDayIndex: index }
  }
  return null
}

/** True once this day's ideas have been asked for at least once. */
export function hasFillIdeasRun(
  draft: ListicleItineraryDraft,
  dayIndex: number,
): boolean {
  const day = draft.days[dayIndex]
  if (!day) return false
  return (draft.fillIdeaRuns ?? []).some((run) => run.dayId === day.id)
}

export function getFillIdeasDayGate(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): FillIdeasDayGate {
  if (!draft.days[dayIndex]) {
    return { canRun: false, reason: 'This day is not part of the itinerary.' }
  }

  if (!draft.title.trim() || !draft.location.trim()) {
    return { canRun: false, reason: 'Add the title and location first.' }
  }

  const setupIssues = validateStep1(draft)
  if (setupIssues.length) {
    return { canRun: false, reason: setupIssues[0] }
  }

  if (!draft.step1_complete) {
    return { canRun: false, reason: 'Finish and save the setup first.' }
  }

  if (!dayLodgingTitles(draft.days[0], relatedByBlockType).length) {
    return {
      canRun: false,
      reason: 'Pick where they are staying on Day 1 first — the day is routed from the hotel.',
    }
  }

  // Strictly the day before, not "any earlier day": the chain is what tells
  // this call which places are already spoken for.
  if (dayIndex > 0 && !hasFillIdeasRun(draft, dayIndex - 1)) {
    return {
      canRun: false,
      reason: `Get Day ${dayIndex} ideas first — each day is told what the days before it used.`,
    }
  }

  return { canRun: true }
}

/** Every place already committed to a slot anywhere in the trip. */
export function collectCommittedPlaceTitles(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string[] {
  const seen = new Set<string>()
  draft.days.forEach((day) => {
    ;[...day.whereStaying, ...day.items].forEach((item) => {
      const title = resolveFillSlotTitle(item, relatedByBlockType)
      if (title) seen.add(title)
    })
  })
  return [...seen]
}
