import { DEFAULT_TEMPLATE_ID, defaultTemplate } from './templates'
import {
  DRAFT_SCHEMA_VERSION,
  type AvailableTime,
  type AvailableTimeId,
  type DayDraft,
  type Daypart,
  type DayTemplate,
  type ItinerarySetupDraft,
  type SlotSnapshot,
  type StayDraft,
  type StayMode,
  type TripDraft,
} from './types'

/**
 * Draft construction and the two signatures approval is measured against.
 *
 * The signatures are the load-bearing idea here. Instead of a boolean that
 * someone has to remember to clear, a day records the exact shape of the trip
 * and of its own layout at the moment it was approved. Approval is current only
 * while both still describe what is on screen — so retyping a value to its
 * existing text, focusing a field, or switching tabs cannot invalidate
 * anything, and a real edit cannot fail to.
 */

let idCounter = 0

/** Stable, collision-free within a browser session; readable in a test failure. */
export function createId(prefix: string): string {
  idCounter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${random}`
}

export function emptyTrip(): TripDraft {
  return {
    titleSeed: '',
    dayCountInput: '',
    baseCity: '',
    scope: 'city_only',
    timing: { mode: 'evergreen', startDate: '', firstWeekday: '' },
    preferredAreas: [],
    startingBase: '',
    sharedPreferences: {
      audience: '',
      budgetStyle: 'unspecified',
      budgetNote: '',
      pace: 'unspecified',
      transport: [],
      transportNote: '',
      walkingTolerance: 'unspecified',
      dietaryNeeds: '',
      accessNeeds: '',
      mustInclude: '',
      avoid: '',
    },
    getaway: { destination: '', departureDay: null, returnDay: null },
    stays: [],
  }
}

/** How many nights a trip of this many days has by default: the last day
 *  ends in a departure, but a one-day trip still gets its one night. */
export function defaultNightCount(dayCount: number): number {
  return Math.max(1, dayCount - 1)
}

export function createStay(mode: StayMode, stays: StayDraft[], dayCount: number): StayDraft {
  const lastCovered = stays.reduce((top, stay) => Math.max(top, stay.lastNight), 0)
  const nights = defaultNightCount(dayCount)
  const first = Math.min(lastCovered + 1, Math.max(nights, 1))
  return {
    id: createId('stay'),
    mode,
    locationId: null,
    name: '',
    area: '',
    note: '',
    firstNight: first,
    lastNight: Math.max(first, nights),
  }
}

/** The stay covering a night, the earlier one winning an overlap. */
export function stayForNight(stays: StayDraft[] | undefined, night: number): StayDraft | null {
  return (stays ?? []).find(stay => stay.firstNight <= night && night <= stay.lastNight) ?? null
}

/** Where day N (1-based) starts and where the traveller sleeps after it. */
export function dayStays(
  stays: StayDraft[] | undefined,
  dayNumber: number,
): { start: StayDraft | null; end: StayDraft | null } {
  return {
    start: stayForNight(stays, Math.max(1, dayNumber - 1)),
    end: stayForNight(stays, dayNumber),
  }
}

export function fullDayTime(): AvailableTime {
  return { id: 'full_day', customStart: '', customEnd: '', endsNextDay: false }
}

/**
 * Copy a template into a day.
 *
 * Every slot gets a fresh occurrence id and its own object; `sourceSlotId`
 * remembers where it came from without letting the library speak for it later.
 */
export function snapshotTemplate(template: DayTemplate): SlotSnapshot[] {
  return template.slots.map(spec => ({
    ...spec,
    id: createId('slot'),
    allowedCategories: [...spec.allowedCategories],
    preferredCategories: [...spec.preferredCategories],
    cues: [...spec.cues],
    exclusions: [...spec.exclusions],
    travel: spec.travel ? { ...spec.travel } : undefined,
  }))
}

export function createDay(index: number, template: DayTemplate = defaultTemplate()): DayDraft {
  return {
    id: createId('day'),
    label: `Day ${index + 1}`,
    sourceTemplateId: template.id,
    sourceTemplateName: template.name,
    sourceTemplateOrigin: template.origin,
    availableTime: fullDayTime(),
    slots: snapshotTemplate(template),
    setupNotes: '',
    preparationNotes: '',
    approval: undefined,
    acknowledgments: [],
  }
}

export function createEmptyDraft(): ItinerarySetupDraft {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    draftId: createId('draft'),
    updatedAt: new Date().toISOString(),
    trip: emptyTrip(),
    days: [],
    ui: { stage: 'trip', activeDayId: null, expandedSlotId: null },
  }
}

/** Day count as a number, or null when the box does not hold a whole number ≥ 1. */
export function parsedDayCount(trip: TripDraft): number | null {
  const raw = trip.dayCountInput.trim()
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return value >= 1 ? value : null
}

/**
 * Everything a day's approval depends on from the shared trip.
 *
 * Conservative on purpose: the plan asks that any shared change reopen every
 * layout, because a different city, party or day count changes what a layout
 * meant even when its stops did not move.
 */
export function tripSignature(trip: TripDraft): string {
  const preferences = trip.sharedPreferences
  return JSON.stringify([
    trip.titleSeed.trim(),
    trip.dayCountInput.trim(),
    trip.baseCity.trim(),
    trip.scope,
    trip.timing.mode,
    trip.timing.startDate,
    trip.timing.firstWeekday,
    trip.preferredAreas,
    trip.startingBase.trim(),
    [
      preferences.audience.trim(),
      preferences.budgetStyle,
      preferences.budgetNote.trim(),
      preferences.pace,
      preferences.transport,
      preferences.transportNote.trim(),
      preferences.walkingTolerance,
      preferences.dietaryNeeds.trim(),
      preferences.accessNeeds.trim(),
      preferences.mustInclude.trim(),
      preferences.avoid.trim(),
    ],
    trip.scope === 'with_getaway'
      ? [trip.getaway.destination.trim(), trip.getaway.departureDay, trip.getaway.returnDay]
      : null,
  ])
}

/**
 * Everything a day's approval depends on from the day itself.
 *
 * Both note fields are excluded. Setup notes and preparation notes are input to
 * a future conversation, not part of the structure that was approved, and
 * making them invalidate approval would punish the operator for thinking.
 */
export function layoutSignature(day: DayDraft): string {
  return JSON.stringify([
    day.label.trim(),
    day.sourceTemplateId,
    day.availableTime,
    day.slots.map(slot => [
      slot.kind,
      slot.label.trim(),
      slot.daypart,
      slot.optional,
      slot.purpose.trim(),
      slot.allowedCategories,
      slot.preferredCategories,
      slot.cues,
      slot.exclusions,
      slot.travel ?? null,
    ]),
  ])
}

export function isApprovalCurrent(day: DayDraft, trip: TripDraft): boolean {
  if (!day.approval) return false
  return (
    day.approval.tripRevision === tripSignature(trip) &&
    day.approval.layoutRevision === layoutSignature(day)
  )
}

/** An approval that exists but no longer describes the day on screen. */
export function isApprovalStale(day: DayDraft, trip: TripDraft): boolean {
  return Boolean(day.approval) && !isApprovalCurrent(day, trip)
}

/** Acknowledgments are stamped with the layout they answered, so edits reset them. */
export function acknowledgmentKey(kind: string, day: DayDraft): string {
  return `${kind}:${layoutSignature(day)}`
}

export function hasAcknowledgment(kind: string, day: DayDraft): boolean {
  return day.acknowledgments.includes(acknowledgmentKey(kind, day))
}

export const AVAILABLE_TIME_LABELS: Record<AvailableTimeId, string> = {
  full_day: 'Full day',
  morning_only: 'Morning only',
  afternoon_onward: 'Afternoon onward',
  evening_only: 'Evening only',
  custom: 'Custom window',
}

/**
 * Which coarse dayparts each window admits.
 *
 * Lunch is deliberately absent from Morning only: the product convention is
 * that "morning" ends before the midday meal, and saying so in helper copy is
 * cheaper than arguing about it in every draft. `custom` admits everything and
 * buys a one-time acknowledgment on review instead.
 */
export const WINDOW_DAYPARTS: Record<AvailableTimeId, Daypart[] | null> = {
  full_day: null,
  morning_only: ['morning', 'late_morning'],
  afternoon_onward: ['afternoon', 'dinner', 'evening', 'nightlife'],
  evening_only: ['dinner', 'evening', 'nightlife'],
  custom: null,
}

export function daypartFitsWindow(daypart: Daypart, time: AvailableTime): boolean {
  const allowed = WINDOW_DAYPARTS[time.id]
  return allowed === null || allowed.includes(daypart)
}

export { DEFAULT_TEMPLATE_ID }
