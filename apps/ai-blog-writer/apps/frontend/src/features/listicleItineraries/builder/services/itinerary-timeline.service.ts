import { computeItemWindows, durationToMinutes, fromMinutesToClock, toMinutesFromMidnight } from '../../time'
import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'

export function getWindowBounds(current: ListicleItineraryDraft): { start: number; end: number } | null {
  try {
    return {
      start: toMinutesFromMidnight(current.itineraryStartHour, current.itineraryStartMinute, current.itineraryStartPeriod),
      end: toMinutesFromMidnight(current.itineraryEndHour, current.itineraryEndMinute, current.itineraryEndPeriod),
    }
  } catch {
    return null
  }
}

export function withEndAlignedToLastItem(current: ListicleItineraryDraft): ListicleItineraryDraft {
  if (!current.items.length) return current

  try {
    const windows = computeItemWindows(current.items)
    if (!windows.length) return current
    const lastEnd = windows[windows.length - 1].end
    const clock = fromMinutesToClock(lastEnd)

    return {
      ...current,
      itineraryEndHour: clock.hour,
      itineraryEndMinute: clock.minute,
      itineraryEndPeriod: clock.period,
    }
  } catch {
    return current
  }
}

export function autoChainItems(current: ListicleItineraryDraft, startIndex = 1): ListicleItineraryDraft {
  if (!current.items.length) return current

  const items = current.items.map((item) => ({ ...item }))
  const chainStart = Math.max(1, startIndex)

  for (let i = chainStart; i < items.length; i += 1) {
    const prev = items[i - 1]
    const prevStart = toMinutesFromMidnight(prev.timeHour, prev.timeMinute, prev.timePeriod)
    const prevDuration = durationToMinutes(prev.durationHours, prev.durationMinutes)
    const nextStart = prevStart + prevDuration
    const clock = fromMinutesToClock(nextStart)

    items[i].timeHour = clock.hour
    items[i].timeMinute = clock.minute
    items[i].timePeriod = clock.period
  }

  return {
    ...current,
    items,
  }
}

export function createNewItem(current: ListicleItineraryDraft): ItineraryItemBlock {
  let nextStart = 9 * 60
  if (current.items.length > 0) {
    const prev = current.items[current.items.length - 1]
    const prevStart = toMinutesFromMidnight(prev.timeHour, prev.timeMinute, prev.timePeriod)
    const prevDuration = durationToMinutes(prev.durationHours, prev.durationMinutes)
    nextStart = prevStart + prevDuration
  } else {
    const bounds = getWindowBounds(current)
    if (bounds) nextStart = bounds.start
  }

  const clock = fromMinutesToClock(nextStart)

  return {
    id: `item_${Date.now()}`,
    blockType: 'itinerary-dining',
    item: null,
    timeHour: clock.hour,
    timeMinute: clock.minute,
    timePeriod: clock.period,
    durationHours: 1,
    durationMinutes: '0',
    blurbMarkdown: '',
    blurbJsonText: '',
  }
}

export function hasContinuousCoverage(draft: ListicleItineraryDraft): boolean {
  const derivedDraft = withEndAlignedToLastItem(draft)
  try {
    const windows = computeItemWindows(derivedDraft.items)
    const startWindow = toMinutesFromMidnight(
      derivedDraft.itineraryStartHour,
      derivedDraft.itineraryStartMinute,
      derivedDraft.itineraryStartPeriod,
    )
    return (
      windows.length > 0
      && windows[0].start === startWindow
      && windows.every((window, index) => (index === 0 ? true : window.start === windows[index - 1].end))
    )
  } catch {
    return false
  }
}
