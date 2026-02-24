import type { DurationMinute, Meridiem, QuarterMinute } from './types'

export type ComputedItemWindow = {
  index: number
  start: number
  end: number
}

export function toMinutesFromMidnight(hour: number, minute: QuarterMinute | string, period: Meridiem | string): number {
  const safeHour = Number(hour)
  const safeMinute = typeof minute === 'string' ? Number.parseInt(minute, 10) : Number(minute)

  if (!Number.isInteger(safeHour) || safeHour < 1 || safeHour > 12) {
    throw new Error('Invalid hour. Expected a value between 1 and 12.')
  }

  if (!Number.isInteger(safeMinute) || safeMinute < 0 || safeMinute > 59) {
    throw new Error('Invalid minute. Expected a value between 0 and 59.')
  }

  if (period !== 'AM' && period !== 'PM') {
    throw new Error('Invalid period. Expected AM or PM.')
  }

  let hour24 = safeHour
  if (period === 'PM' && safeHour !== 12) hour24 += 12
  if (period === 'AM' && safeHour === 12) hour24 = 0

  return hour24 * 60 + safeMinute
}

export function durationToMinutes(durationHours: number | undefined, durationMinutes: DurationMinute | string | undefined): number {
  const hours = Number(durationHours ?? 0)
  const minutes = typeof durationMinutes === 'string' ? Number.parseInt(durationMinutes, 10) : Number(durationMinutes ?? 0)

  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error('Invalid duration hours.')
  }

  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    throw new Error('Invalid duration minutes.')
  }

  return hours * 60 + minutes
}

export function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function computeItemWindows(
  items: Array<{
    timeHour: number
    timeMinute: QuarterMinute
    timePeriod: Meridiem
    durationHours: number
    durationMinutes: DurationMinute
  }>,
): ComputedItemWindow[] {
  return items.map((item, index) => {
    const start = toMinutesFromMidnight(item.timeHour, item.timeMinute, item.timePeriod)
    const duration = durationToMinutes(item.durationHours, item.durationMinutes)
    if (duration <= 0) {
      throw new Error(`Item ${index + 1} must have a duration greater than 0 minutes.`)
    }

    return {
      index,
      start,
      end: start + duration,
    }
  })
}

export function fromMinutesToClock(minutes: number): { hour: number; minute: QuarterMinute; period: Meridiem } {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const hour24 = Math.floor(normalized / 60)
  const minuteValue = normalized % 60
  const roundedMinute = Math.floor(minuteValue / 15) * 15
  const minute = String(roundedMinute).padStart(2, '0') as QuarterMinute

  const period: Meridiem = hour24 >= 12 ? 'PM' : 'AM'
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12

  return {
    hour,
    minute,
    period,
  }
}

export function toDurationParts(minutes: number): { durationHours: number; durationMinutes: DurationMinute } {
  const positiveMinutes = Math.max(15, minutes)
  const rounded = Math.ceil(positiveMinutes / 15) * 15
  const durationHours = Math.floor(rounded / 60)
  const minuteValue = rounded % 60
  const durationMinutes = minuteValue === 0 ? '0' : String(minuteValue) as DurationMinute

  return {
    durationHours,
    durationMinutes,
  }
}
