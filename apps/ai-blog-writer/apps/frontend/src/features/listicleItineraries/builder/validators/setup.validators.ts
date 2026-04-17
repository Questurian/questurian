import type { ListicleItineraryDraft } from '../../types'

export function validateStep1(current: ListicleItineraryDraft): string[] {
  const issues: string[] = []
  if (!current.title.trim()) issues.push('Title is required')
  if (!current.location.trim()) issues.push('Location is required')
  if (!current.dayAudience) issues.push('Day type is required')
  if (!current.tripIntent || current.tripIntent.length === 0) issues.push('Trip intent is required')

  return issues
}
