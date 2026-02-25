import type { ItineraryBlockType, ListicleItineraryDraft, RelatedItemOption } from '../../types'
import {
  getRelatedInstagramPostIds,
  getRelatedPhotoIds,
  isMediaMode,
  requiresInstagram,
  requiresPhotos,
} from '../utils/item-media.utils'

export function validateItemMediaSelections(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string[] {
  const issues: string[] = []

  for (let index = 0; index < draft.items.length; index += 1) {
    const item = draft.items[index]

    if (!item.item) {
      issues.push(`Item ${index + 1} is missing related entry selection`)
      continue
    }

    const relatedOptions = relatedByBlockType[item.blockType] || []
    const selectedRelated = relatedOptions.find((entry) => entry.id === item.item)
    if (!selectedRelated) {
      issues.push(`Item ${index + 1} selected related entry is unavailable for the current filters`)
      continue
    }

    if (!isMediaMode(item.mediaMode)) {
      issues.push(`Item ${index + 1} must select a media mode (photos, instagram, or both)`)
      continue
    }

    const availablePhotoIds = new Set(getRelatedPhotoIds(selectedRelated))
    const availableInstagramPostIds = new Set(getRelatedInstagramPostIds(selectedRelated))

    if (requiresPhotos(item.mediaMode)) {
      if (item.selectedPhotos.length < 1 || item.selectedPhotos.length > 6) {
        issues.push(`Item ${index + 1} must select between 1 and 6 photos`)
        continue
      }

      const invalidPhotoId = item.selectedPhotos.find((photoId) => !availablePhotoIds.has(photoId))
      if (invalidPhotoId !== undefined) {
        issues.push(`Item ${index + 1} selected photo ${invalidPhotoId} is not in the source gallery`)
        continue
      }
    }

    if (requiresInstagram(item.mediaMode)) {
      if (!item.selectedInstagramPost) {
        issues.push(`Item ${index + 1} must select one Instagram embed`)
        continue
      }

      if (!availableInstagramPostIds.has(item.selectedInstagramPost)) {
        issues.push(`Item ${index + 1} selected Instagram embed is not in the source gallery`)
      }
    }
  }

  return issues
}
