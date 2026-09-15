import { AVAILABLE_TIME_LABELS, parsedDayCount } from './draft'
import type { DayDraft, TravelPoint, TripDraft } from './types'

/**
 * Read-only views of the shared trip, derived rather than copied.
 *
 * Shared data is stored once. The workspace and the review screen ask for it
 * here instead of each day carrying its own copy, which is the only way a
 * change to the base city can reach every day that inherits it.
 */

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

/**
 * The date or weekday this day falls on, when the trip says so.
 *
 * Evergreen trips return an empty string: attaching an invented weekday to a
 * trip that deliberately has none would be a fact the operator never supplied.
 */
export function dayDateLabel(trip: TripDraft, index: number): string {
  if (trip.timing.mode === 'specific_dates' && trip.timing.startDate) {
    const start = new Date(`${trip.timing.startDate}T00:00:00`)
    if (Number.isNaN(start.getTime())) return ''
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }
  if (trip.timing.mode === 'weekday_sequence' && trip.timing.firstWeekday) {
    const first = WEEKDAY_INDEX[trip.timing.firstWeekday]
    if (first === undefined) return ''
    return WEEKDAY_NAMES[(first + index) % 7]
  }
  return ''
}

/** The last date of the trip, derived from the day count. Never asked for. */
export function derivedEndDate(trip: TripDraft): string {
  const count = parsedDayCount(trip)
  if (trip.timing.mode !== 'specific_dates' || !trip.timing.startDate || !count) return ''
  const start = new Date(`${trip.timing.startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return ''
  const end = new Date(start)
  end.setDate(start.getDate() + count - 1)
  return end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function travelPointLabel(point: TravelPoint, trip: TripDraft): string {
  if (point.ref === 'base') return trip.baseCity.trim() || 'Base city'
  if (point.ref === 'getaway') {
    return trip.getaway.destination.trim() || 'Getaway destination — undecided'
  }
  return point.text.trim() || 'Somewhere'
}

export interface ContextRow {
  label: string
  value: string
}

const BUDGET_LABELS: Record<string, string> = {
  unspecified: '',
  budget: 'Budget-conscious',
  mid_range: 'Mid-range',
  premium: 'Premium',
  mixed: 'Mixed',
}

const PACE_LABELS: Record<string, string> = {
  unspecified: '',
  relaxed: 'Relaxed',
  balanced: 'Balanced',
  full: 'Full',
}

const WALKING_LABELS: Record<string, string> = {
  unspecified: '',
  short: 'Short walks',
  moderate: 'Moderate walks',
  long: 'Long walks welcome',
}

const TRANSPORT_LABELS: Record<string, string> = {
  walking: 'Walking',
  public_transport: 'Public transport',
  taxi: 'Taxi or rideshare',
  rental_car: 'Rental car',
}

const SCOPE_LABELS: Record<string, string> = {
  city_only: 'City only',
  with_getaway: 'Includes an overnight getaway',
}

/** The trip as headline facts. Always present, because they are required. */
export function tripSummaryRows(trip: TripDraft): ContextRow[] {
  const rows: ContextRow[] = [
    { label: 'Base city', value: trip.baseCity.trim() || '—' },
    { label: 'Days', value: trip.dayCountInput.trim() || '—' },
    { label: 'Scope', value: SCOPE_LABELS[trip.scope] },
  ]

  if (trip.timing.mode === 'specific_dates') {
    const end = derivedEndDate(trip)
    rows.push({
      label: 'Dates',
      value: trip.timing.startDate
        ? `${new Date(`${trip.timing.startDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}${end ? ` – ${end}` : ''}`
        : '—',
    })
  } else if (trip.timing.mode === 'weekday_sequence') {
    rows.push({
      label: 'Starts on',
      value: trip.timing.firstWeekday
        ? trip.timing.firstWeekday[0].toUpperCase() + trip.timing.firstWeekday.slice(1)
        : '—',
    })
  } else {
    rows.push({ label: 'Timing', value: 'Evergreen' })
  }

  if (trip.preferredAreas.length > 0) {
    rows.push({ label: 'Preferred areas', value: trip.preferredAreas.join(', ') })
  }
  if (trip.startingBase.trim()) {
    rows.push({ label: 'Starting base', value: trip.startingBase.trim() })
  }
  if (trip.scope === 'with_getaway') {
    const { destination, departureDay, returnDay } = trip.getaway
    const when =
      departureDay && returnDay ? `Day ${departureDay} → Day ${returnDay}` : 'Days not set'
    rows.push({
      label: 'Getaway',
      value: `${destination.trim() || 'Destination undecided'} · ${when}`,
    })
  }
  return rows
}

/**
 * Shared preferences that were actually entered.
 *
 * A blank field is not shown. "Unspecified" is a real state and printing a
 * screenful of them would bury the two answers that matter.
 */
export function preferenceRows(trip: TripDraft): ContextRow[] {
  const preferences = trip.sharedPreferences
  const rows: ContextRow[] = []
  const add = (label: string, value: string) => {
    if (value.trim()) rows.push({ label, value: value.trim() })
  }

  add('Who this is for', preferences.audience)
  add('Budget style', BUDGET_LABELS[preferences.budgetStyle] ?? '')
  add('Budget note', preferences.budgetNote)
  add('Pace', PACE_LABELS[preferences.pace] ?? '')
  add(
    'Getting around',
    preferences.transport.map(mode => TRANSPORT_LABELS[mode]).join(', '),
  )
  add('Transport note', preferences.transportNote)
  add('Walking tolerance', WALKING_LABELS[preferences.walkingTolerance] ?? '')
  add('Dietary needs', preferences.dietaryNeeds)
  add('Access needs', preferences.accessNeeds)
  add('Must include', preferences.mustInclude)
  add('Avoid', preferences.avoid)

  return rows
}

/** The window as one short phrase, including a custom range. */
export function availableTimeLabel(day: DayDraft): string {
  const { availableTime } = day
  if (availableTime.id !== 'custom') return AVAILABLE_TIME_LABELS[availableTime.id]
  const { customStart, customEnd, endsNextDay } = availableTime
  if (!customStart || !customEnd) return 'Custom window'
  return `${customStart} – ${customEnd}${endsNextDay ? ' (next day)' : ''}`
}

/** The tab's caption: "Day 2", plus a date or weekday when the trip has one. */
export function dayTabLabel(trip: TripDraft, index: number): string {
  const date = dayDateLabel(trip, index)
  return date ? `Day ${index + 1} · ${date}` : `Day ${index + 1}`
}
