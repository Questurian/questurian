import { toMinutesFromMidnight } from '../../time'
import type { ListicleItineraryDraft } from '../../types'

export function validateStep1(current: ListicleItineraryDraft): string[] {
  const issues: string[] = []
  if (!current.title.trim()) issues.push('Title is required')
  if (!current.location.trim()) issues.push('Location is required')
  if (!current.dayAudience) issues.push('Day type is required')
  if (!current.tripIntent || current.tripIntent.length === 0) issues.push('Trip intent is required')

  try {
    toMinutesFromMidnight(current.itineraryStartHour, current.itineraryStartMinute, current.itineraryStartPeriod)
  } catch (err) {
    issues.push(err instanceof Error ? err.message : 'Invalid itinerary start time')
  }

  return issues
}
