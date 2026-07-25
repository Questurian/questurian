import type { MediaMode, RelatedItemOption } from '../../../types'

const MEDIA_MODE_OPTIONS: Array<{ value: MediaMode; label: string }> = [
  { value: 'photos', label: 'Photos' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'both', label: 'Photos + Instagram' }
]

export function getRelatedItemIdealFor(
  relatedItem: RelatedItemOption | null
): string[] {
  if (!relatedItem) return []

  const raw = relatedItem as RelatedItemOption & Record<string, unknown>
  const value = raw.idealFor ?? raw.ideal_for
  if (!Array.isArray(value)) return []

  return value
    .filter(
      (entry): entry is string =>
        typeof entry === 'string' && entry.trim().length > 0
    )
    .map((entry) => entry.trim())
}

export function getAvailableMediaModeOptions(
  hasPhotos: boolean,
  hasInstagram: boolean
): Array<{ value: MediaMode; label: string }> {
  if (hasPhotos && hasInstagram) return MEDIA_MODE_OPTIONS
  if (hasPhotos) {
    return MEDIA_MODE_OPTIONS.filter((option) => option.value === 'photos')
  }
  if (hasInstagram) {
    return MEDIA_MODE_OPTIONS.filter((option) => option.value === 'instagram')
  }
  return []
}
