import {
  daypartFitsWindow,
  hasAcknowledgment,
  isApprovalCurrent,
  parsedDayCount,
} from './draft'
import { DAYPART_LABELS, DAYPART_ORDER } from './templates'
import type {
  DayDraft,
  ItinerarySetupDraft,
  SlotSnapshot,
  TripDraft,
} from './types'

/**
 * One pure pass over the draft, shared by stage navigation, approval and the
 * error summaries.
 *
 * It returns problems, not a verdict: an id to focus, a day to open and a
 * sentence a person can act on. A boolean would make every caller invent its
 * own explanation, and they would drift.
 *
 * Errors block. Warnings do not — they are things worth saying once that the
 * operator is allowed to disagree with. The one exception is a warning carrying
 * `acknowledgmentKind`: it blocks *approval* only, and is cleared by the
 * operator saying "yes, I meant that", which is recorded against the layout it
 * answered so a later edit asks again.
 */

export type IssueSeverity = 'error' | 'warning'

export interface Issue {
  id: string
  severity: IssueSeverity
  message: string
  /** DOM id of the control to focus when the summary link is followed. */
  fieldId?: string
  dayId?: string
  slotId?: string
  /** Set when a warning is answerable by acknowledgment rather than by a fix. */
  acknowledgmentKind?: string
}

export interface DraftValidation {
  trip: Issue[]
  byDay: Record<string, Issue[]>
}

/** Stable DOM ids, so the summary can link to a control without prop-drilling. */
export const fieldIds = {
  title: 'ip-title',
  dayCount: 'ip-day-count',
  baseCity: 'ip-base-city',
  startDate: 'ip-start-date',
  firstWeekday: 'ip-first-weekday',
  getawayDeparture: 'ip-getaway-departure',
  getawayReturn: 'ip-getaway-return',
  customStart: (dayId: string) => `ip-custom-start-${dayId}`,
  customEnd: (dayId: string) => `ip-custom-end-${dayId}`,
  dayTemplate: (dayId: string) => `ip-day-template-${dayId}`,
  slotLabel: (slotId: string) => `ip-slot-label-${slotId}`,
  slotCategories: (slotId: string) => `ip-slot-categories-${slotId}`,
  slotPurpose: (slotId: string) => `ip-slot-purpose-${slotId}`,
  slotDaypart: (slotId: string) => `ip-slot-daypart-${slotId}`,
  slotTravelFrom: (slotId: string) => `ip-slot-travel-from-${slotId}`,
  slotTravelTo: (slotId: string) => `ip-slot-travel-to-${slotId}`,
}

/**
 * A guard, not a product limit. The plan is explicit that seven days is not a
 * maximum, and this does not contradict it: it exists so that a mistyped year
 * in the day-count box cannot try to render two thousand tabs.
 */
export const MAX_DAYS = 60

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
}

/**
 * A day count stated in the title, when it is stated unambiguously.
 *
 * Only a number that qualifies "day"/"days" counts. Up to two words are allowed
 * in between, because real titles say "Three easy days" as often as "3 days".
 * "24 hours in Lima" and "5 best rooftop bars" name no days and must not
 * produce a warning.
 */
export function dayCountInTitle(title: string): number | null {
  const match = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)(?:[-\s]+[a-z]+){0,2}[-\s]?(?:day|days)\b/i.exec(
    title,
  )
  if (!match) return null
  const token = match[1].toLowerCase()
  const value = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token]
  return value && value > 0 ? value : null
}

export function isSearchableStop(slot: SlotSnapshot): boolean {
  return slot.kind === 'place' || slot.kind === 'experience'
}

function pointIsComplete(point: { ref: string; text?: string }): boolean {
  return point.ref !== 'custom' || Boolean(point.text && point.text.trim())
}

function pointKey(point: { ref: string; text?: string }): string {
  return point.ref === 'custom' ? `custom:${(point.text ?? '').trim().toLowerCase()}` : point.ref
}

export function validateTrip(trip: TripDraft): Issue[] {
  const issues: Issue[] = []
  const push = (issue: Omit<Issue, 'id'> & { id?: string }) =>
    issues.push({ id: issue.id ?? `trip-${issues.length}`, ...issue } as Issue)

  if (!trip.titleSeed.trim()) {
    push({ severity: 'error', message: 'Add your itinerary title.', fieldId: fieldIds.title })
  }

  const dayCount = parsedDayCount(trip)
  if (dayCount === null) {
    push({
      severity: 'error',
      message: 'Enter a whole number of days, at least 1.',
      fieldId: fieldIds.dayCount,
    })
  } else if (dayCount > MAX_DAYS) {
    push({
      severity: 'error',
      message: `More than ${MAX_DAYS} days is almost always a typo. Enter ${MAX_DAYS} or fewer.`,
      fieldId: fieldIds.dayCount,
    })
  }

  if (!trip.baseCity.trim()) {
    push({ severity: 'error', message: 'Add a base city.', fieldId: fieldIds.baseCity })
  }

  if (trip.timing.mode === 'specific_dates' && !trip.timing.startDate) {
    push({
      severity: 'error',
      message: 'Choose the first date of the trip.',
      fieldId: fieldIds.startDate,
    })
  }
  if (trip.timing.mode === 'weekday_sequence' && !trip.timing.firstWeekday) {
    push({
      severity: 'error',
      message: 'Choose the weekday the trip starts on.',
      fieldId: fieldIds.firstWeekday,
    })
  }

  if (trip.scope === 'with_getaway') {
    const { departureDay, returnDay } = trip.getaway
    if (dayCount !== null && dayCount < 2) {
      push({
        severity: 'error',
        message: 'An overnight getaway needs at least two days.',
        fieldId: fieldIds.dayCount,
      })
    }
    if (departureDay === null) {
      push({
        severity: 'error',
        message: 'Choose the day you leave for the getaway.',
        fieldId: fieldIds.getawayDeparture,
      })
    }
    if (returnDay === null) {
      push({
        severity: 'error',
        message: 'Choose the day you come back.',
        fieldId: fieldIds.getawayReturn,
      })
    }
    if (departureDay !== null && returnDay !== null && returnDay <= departureDay) {
      push({
        severity: 'error',
        message: 'The return day has to be later than the departure day.',
        fieldId: fieldIds.getawayReturn,
      })
    }
    if (dayCount !== null) {
      if (departureDay !== null && (departureDay < 1 || departureDay > dayCount)) {
        push({
          severity: 'error',
          message: `The departure day has to be between 1 and ${dayCount}.`,
          fieldId: fieldIds.getawayDeparture,
        })
      }
      if (returnDay !== null && (returnDay < 1 || returnDay > dayCount)) {
        push({
          severity: 'error',
          message: `The return day has to be between 1 and ${dayCount}.`,
          fieldId: fieldIds.getawayReturn,
        })
      }
    }
  }

  // Said once, never enforced. The title is the operator's and may phrase the
  // trip in a way a regular expression has no business overruling.
  const titleDays = dayCountInTitle(trip.titleSeed)
  if (titleDays !== null && dayCount !== null && titleDays !== dayCount) {
    push({
      severity: 'warning',
      message: `Your title says ${titleDays} day${titleDays === 1 ? '' : 's'} but you entered ${dayCount}. Change one, or leave it if the wording is deliberate.`,
      fieldId: fieldIds.dayCount,
    })
  }

  return issues
}

/** Slots whose daypart the chosen window excludes. */
export function outOfWindowSlots(day: DayDraft): SlotSnapshot[] {
  return day.slots.filter(slot => !daypartFitsWindow(slot.daypart, day.availableTime))
}

/** True when the stops do not run in clock order. Noticed, never corrected. */
export function hasUnusualOrder(day: DayDraft): boolean {
  let highest = -1
  for (const slot of day.slots) {
    const index = DAYPART_ORDER.indexOf(slot.daypart)
    if (index < highest) return true
    highest = Math.max(highest, index)
  }
  return false
}

export function validateDay(day: DayDraft, dayNumber: number, trip: TripDraft): Issue[] {
  const issues: Issue[] = []
  const push = (issue: Omit<Issue, 'id'>) =>
    issues.push({ id: `${day.id}-${issues.length}`, dayId: day.id, ...issue })

  if (day.slots.length === 0) {
    push({
      severity: 'error',
      message: `Day ${dayNumber} has no stops. Choose a day type or add one.`,
      fieldId: fieldIds.dayTemplate(day.id),
    })
  }

  if (day.availableTime.id === 'custom') {
    const { customStart, customEnd, endsNextDay } = day.availableTime
    if (!customStart || !customEnd) {
      push({
        severity: 'error',
        message: 'A custom window needs a start and an end time.',
        fieldId: customStart ? fieldIds.customEnd(day.id) : fieldIds.customStart(day.id),
      })
    } else if (!endsNextDay && customEnd <= customStart) {
      push({
        severity: 'error',
        message: 'Set an end time after the start, or choose Ends next day.',
        fieldId: fieldIds.customEnd(day.id),
      })
    }
  }

  day.slots.forEach((slot, index) => {
    const position = index + 1
    if (!slot.label.trim()) {
      push({
        severity: 'error',
        message: `Stop ${position} needs a name.`,
        slotId: slot.id,
        fieldId: fieldIds.slotLabel(slot.id),
      })
    }

    if (isSearchableStop(slot)) {
      if (slot.allowedCategories.length === 0) {
        push({
          severity: 'error',
          message: `“${slot.label || `Stop ${position}`}” needs at least one allowed category.`,
          slotId: slot.id,
          fieldId: fieldIds.slotCategories(slot.id),
        })
      }
      const outside = slot.preferredCategories.filter(
        category => !slot.allowedCategories.includes(category),
      )
      if (outside.length > 0) {
        push({
          severity: 'error',
          message: `“${slot.label || `Stop ${position}`}” prefers a category it does not allow. Allow it, or drop the preference.`,
          slotId: slot.id,
          fieldId: fieldIds.slotCategories(slot.id),
        })
      }
      if (!slot.purpose.trim()) {
        push({
          severity: 'error',
          message: `“${slot.label || `Stop ${position}`}” needs a purpose — it is what the search is told to look for.`,
          slotId: slot.id,
          fieldId: fieldIds.slotPurpose(slot.id),
        })
      }
    }

    if (slot.kind === 'travel') {
      const travel = slot.travel
      if (!travel || !pointIsComplete(travel.from)) {
        push({
          severity: 'error',
          message: `“${slot.label || `Stop ${position}`}” needs a starting point.`,
          slotId: slot.id,
          fieldId: fieldIds.slotTravelFrom(slot.id),
        })
      }
      if (!travel || !pointIsComplete(travel.to)) {
        push({
          severity: 'error',
          message: `“${slot.label || `Stop ${position}`}” needs a destination.`,
          slotId: slot.id,
          fieldId: fieldIds.slotTravelTo(slot.id),
        })
      }
      if (travel && pointKey(travel.from) === pointKey(travel.to)) {
        push({
          severity: 'error',
          message: `“${slot.label || `Stop ${position}`}” starts and ends in the same place.`,
          slotId: slot.id,
          fieldId: fieldIds.slotTravelTo(slot.id),
        })
      }
    }
  })

  for (const slot of outOfWindowSlots(day)) {
    push({
      severity: 'error',
      message: `“${slot.label || 'This stop'}” is a ${DAYPART_LABELS[slot.daypart].toLowerCase()} stop, which this day's window leaves out. Move it, remove it, or widen the window.`,
      slotId: slot.id,
      fieldId: fieldIds.slotDaypart(slot.id),
    })
  }

  // Getaway endpoints need a transfer that is actually planned, on the day it
  // happens. The editor adds it; choosing the scope never inserts it silently.
  if (trip.scope === 'with_getaway') {
    const travelSlots = day.slots.filter(slot => slot.kind === 'travel' && slot.travel)
    if (trip.getaway.departureDay === dayNumber) {
      const hasOutbound = travelSlots.some(
        slot => slot.travel!.from.ref === 'base' && slot.travel!.to.ref === 'getaway',
      )
      if (!hasOutbound) {
        push({
          severity: 'error',
          message: 'This is the getaway departure day. Add a Travel stop from the base city to the getaway.',
          fieldId: fieldIds.dayTemplate(day.id),
        })
      }
    }
    if (trip.getaway.returnDay === dayNumber) {
      const hasReturn = travelSlots.some(
        slot => slot.travel!.from.ref === 'getaway' && slot.travel!.to.ref === 'base',
      )
      if (!hasReturn) {
        push({
          severity: 'error',
          message: 'This is the return day. Add a Travel stop from the getaway back to the base city.',
          fieldId: fieldIds.dayTemplate(day.id),
        })
      }
    }
  }

  // Answerable by agreement rather than by a fix. A custom window cannot be
  // checked against coarse dayparts, and an out-of-clock-order sequence is
  // sometimes exactly what was meant.
  const unusualOrder = hasUnusualOrder(day)
  const customWindow = day.availableTime.id === 'custom'
  if ((unusualOrder || customWindow) && !hasAcknowledgment('order_window', day)) {
    push({
      severity: 'warning',
      acknowledgmentKind: 'order_window',
      message: customWindow
        ? unusualOrder
          ? 'This day uses a custom window and runs its stops out of clock order. Confirm that is what you want.'
          : 'This day uses a custom window. Dayparts cannot be checked against it, so confirm the layout fits.'
        : 'This day runs its stops out of clock order. Confirm that is deliberate.',
      fieldId: fieldIds.dayTemplate(day.id),
    })
  }

  return issues
}

export function validateDraft(draft: ItinerarySetupDraft): DraftValidation {
  const byDay: Record<string, Issue[]> = {}
  draft.days.forEach((day, index) => {
    byDay[day.id] = validateDay(day, index + 1, draft.trip)
  })
  return { trip: validateTrip(draft.trip), byDay }
}

export const errorsOnly = (issues: Issue[]): Issue[] =>
  issues.filter(issue => issue.severity === 'error')

export function tripIsValid(validation: DraftValidation): boolean {
  return errorsOnly(validation.trip).length === 0
}

export function dayIsReady(validation: DraftValidation, dayId: string): boolean {
  return errorsOnly(validation.byDay[dayId] ?? []).length === 0
}

export function canOpenReview(draft: ItinerarySetupDraft, validation: DraftValidation): boolean {
  return (
    tripIsValid(validation) &&
    draft.days.length > 0 &&
    draft.days.every(day => dayIsReady(validation, day.id))
  )
}

/** Approval needs a clean day *and* an answer to anything the day asked about. */
export function canApproveDay(validation: DraftValidation, dayId: string): boolean {
  const issues = validation.byDay[dayId] ?? []
  return (
    errorsOnly(issues).length === 0 &&
    issues.every(issue => !issue.acknowledgmentKind)
  )
}

export function canOpenWorkspace(draft: ItinerarySetupDraft, validation: DraftValidation): boolean {
  return (
    canOpenReview(draft, validation) &&
    draft.days.every(day => isApprovalCurrent(day, draft.trip))
  )
}

/** Day status as the tabs show it. Derived every render; never stored. */
export type DayStatus = 'needs_layout' | 'ready' | 'approved' | 'needs_review'

export function dayStatus(
  day: DayDraft,
  trip: TripDraft,
  validation: DraftValidation,
): DayStatus {
  if (!dayIsReady(validation, day.id)) return 'needs_layout'
  if (isApprovalCurrent(day, trip)) return 'approved'
  if (day.approval) return 'needs_review'
  return 'ready'
}

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  needs_layout: 'Needs layout',
  ready: 'Ready',
  approved: 'Approved',
  needs_review: 'Needs review',
}
