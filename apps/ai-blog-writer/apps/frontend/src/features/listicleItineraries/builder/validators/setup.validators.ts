import type { ListicleItineraryDraft } from '../../types'

export function validateStep1(current: ListicleItineraryDraft): string[] {
  const issues: string[] = []
  if (!current.title.trim()) issues.push('Title is required')
  if (!current.location.trim()) issues.push('Location is required')
  if (!current.payloadSlug?.trim()) issues.push('Slug is required')

  if (
    !Number.isInteger(current.dayCount)
    || current.dayCount < 1
    || current.dayCount > 7
  ) {
    issues.push('Itinerary length must be between 1 and 7 days')
  } else if (current.days.length !== current.dayCount) {
    issues.push('Day count must match the number of itinerary days')
  }

  return issues
}
