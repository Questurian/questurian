import { computeItemWindows, formatMinutes, toMinutesFromMidnight } from '../../time'
import type { ListicleItineraryDraft } from '../../types'

export function validateItemTimeline(current: ListicleItineraryDraft, targetStatus: 'draft' | 'published'): string[] {
  const issues: string[] = []
  let startWindow = 0
  try {
    startWindow = toMinutesFromMidnight(
      current.itineraryStartHour,
      current.itineraryStartMinute,
      current.itineraryStartPeriod,
    )
  } catch (err) {
    issues.push(err instanceof Error ? err.message : 'Invalid itinerary time values')
    return issues
  }

  try {
    const windows = computeItemWindows(current.items)

    for (let i = 0; i < windows.length; i += 1) {
      const item = windows[i]

      if (item.start < startWindow) {
        issues.push(
          `Item ${item.index + 1} starts at ${formatMinutes(item.start)} before itinerary start ${formatMinutes(startWindow)}`,
        )
      }

      if (i > 0) {
        const prev = windows[i - 1]
        if (item.start < prev.start) {
          issues.push(
            `Itinerary items must be in chronological order. Item ${item.index + 1} starts before item ${prev.index + 1}`,
          )
        }

        if (item.start < prev.end) {
          issues.push(
            `Time conflict: item ${item.index + 1} starts at ${formatMinutes(item.start)} before item ${prev.index + 1} ends at ${formatMinutes(prev.end)}`,
          )
        }
      }
    }

    if (targetStatus === 'published') {
      if (!windows.length) {
        issues.push('Publishing requires at least one itinerary item')
      } else {
        const first = windows[0]

        if (first.start !== startWindow) {
          issues.push(`Published itineraries must start exactly at ${formatMinutes(startWindow)}`)
        }

        for (let i = 1; i < windows.length; i += 1) {
          const prev = windows[i - 1]
          const curr = windows[i]
          if (curr.start !== prev.end) {
            issues.push(
              `Published itineraries cannot have gaps: item ${prev.index + 1} ends at ${formatMinutes(prev.end)} but item ${curr.index + 1} starts at ${formatMinutes(curr.start)}`,
            )
          }
        }
      }
    }
  } catch (err) {
    issues.push(err instanceof Error ? err.message : 'Invalid item schedule')
  }

  return issues
}
