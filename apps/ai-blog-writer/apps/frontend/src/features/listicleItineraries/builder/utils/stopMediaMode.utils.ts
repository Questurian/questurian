import type { MediaMode } from '../../types'

export const MEDIA_MODE_OPTIONS: Array<{ value: MediaMode; label: string }> = [
  { value: 'photos', label: 'Photos' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'both', label: 'Photos + Instagram' },
]

export function getAvailableMediaModeOptions(
  hasPhotos: boolean,
  hasInstagram: boolean,
): Array<{ value: MediaMode; label: string }> {
  if (hasPhotos && hasInstagram) return MEDIA_MODE_OPTIONS
  if (hasPhotos) return MEDIA_MODE_OPTIONS.filter((option) => option.value === 'photos')
  if (hasInstagram) return MEDIA_MODE_OPTIONS.filter((option) => option.value === 'instagram')
  return []
}
