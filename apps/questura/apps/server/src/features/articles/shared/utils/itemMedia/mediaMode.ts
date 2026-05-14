import type { MediaMode } from '../../types/item-media.types'

const isMediaMode = (value: unknown): value is MediaMode =>
  value === 'photos' || value === 'instagram' || value === 'both'

export const getMediaMode = (value: unknown): MediaMode | null => {
  if (!isMediaMode(value)) {
    return null
  }

  return value
}

export const requiresPhotos = (mode: MediaMode | null | undefined): boolean =>
  mode === 'photos' || mode === 'both'

export const requiresInstagram = (mode: MediaMode | null | undefined): boolean =>
  mode === 'instagram' || mode === 'both'
