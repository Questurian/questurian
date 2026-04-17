import type { ListicleItineraryDraft } from '../../types'

export function validateStep1(current: ListicleItineraryDraft): string[] {
  const issues: string[] = []
  if (!current.title.trim()) issues.push('Title is required')
  if (!current.location.trim()) issues.push('Location is required')

  return issues
}
