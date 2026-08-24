import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  resolveImageUrl,
  resolveInstagramPermalink,
} from '../utils/item-media.utils'
import type { RelatedItemMediaSource } from '../types'

type SelectableMediaItem = {
  selectedPhotos: number[]
  selectedInstagramPost: number | null
}

const STRUCTURED_MEDIA_BASE_URL = (
  import.meta.env.VITE_SCHEMA_MEDIA_BASE_URL || 'https://cms.questurian.com'
).replace(/\/+$/, '')

function resolvePublicStructuredMediaUrl(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return value
    }

    return `${STRUCTURED_MEDIA_BASE_URL}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return value
  }
}

/**
 * The operator's chosen photo, falling back to any resolvable related photo so
 * structured data still carries an image when nothing was picked.
 */
export function resolveSelectedImageUrl(
  selectable: SelectableMediaItem,
  relatedItem: RelatedItemMediaSource,
): string | undefined {
  const photoById = new Map<number, string>()
  getRelatedPhotoObjects(relatedItem).forEach((photo) => {
    const url = resolveImageUrl(photo)
    if (!url) return
    photoById.set(photo.id, resolvePublicStructuredMediaUrl(url))
  })

  for (const photoId of selectable.selectedPhotos) {
    const selected = photoById.get(photoId)
    if (selected) return selected
  }

  for (const candidate of photoById.values()) {
    return candidate
  }

  return undefined
}

export function resolveSelectedInstagramPermalink(
  selectable: SelectableMediaItem,
  relatedItem: RelatedItemMediaSource,
): string | undefined {
  if (!selectable.selectedInstagramPost) return undefined
  const selectedPost = getRelatedInstagramPostObjects(relatedItem)
    .find((post) => post.id === selectable.selectedInstagramPost)
  if (!selectedPost) return undefined
  return resolveInstagramPermalink(selectedPost)
}
