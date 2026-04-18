import {
  isManualItineraryBlockType,
  type ItineraryBlockType,
  type ItineraryItemBlock,
  type ListicleItineraryDraft,
  type RelatedItemOption,
} from '../../types'
import {
  getRelatedInstagramPostIds,
  getRelatedPhotoIds,
  isMediaMode,
  requiresInstagram,
  requiresPhotos,
} from '../utils/item-media.utils'

function validateItemMediaRows(
  rows: ItineraryItemBlock[],
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
  labelAt: (index: number) => string,
): string[] {
  const issues: string[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const item = rows[index]
    const label = labelAt(index)

    if (isManualItineraryBlockType(item.blockType)) {
      continue
    }

    if (!item.item) {
      issues.push(`${label} is missing related entry selection`)
      continue
    }

    const relatedOptions = relatedByBlockType[item.blockType] || []
    const selectedRelated = relatedOptions.find((entry) => entry.id === item.item)
    if (!selectedRelated) {
      issues.push(`${label} selected related entry is unavailable for the current filters`)
      continue
    }

    if (!isMediaMode(item.mediaMode)) {
      issues.push(`${label} must select a media mode (photos, instagram, or both)`)
      continue
    }

    const availablePhotoIds = new Set(getRelatedPhotoIds(selectedRelated))
    const availableInstagramPostIds = new Set(getRelatedInstagramPostIds(selectedRelated))

    if (requiresPhotos(item.mediaMode)) {
      if (item.selectedPhotos.length < 1 || item.selectedPhotos.length > 6) {
        issues.push(`${label} must select between 1 and 6 photos`)
        continue
      }

      const invalidPhotoId = item.selectedPhotos.find((photoId) => !availablePhotoIds.has(photoId))
      if (invalidPhotoId !== undefined) {
        issues.push(`${label} selected photo ${invalidPhotoId} is not in the source gallery`)
        continue
      }
    }

    if (requiresInstagram(item.mediaMode)) {
      if (!item.selectedInstagramPost) {
        issues.push(`${label} must select one Instagram embed`)
        continue
      }

      if (!availableInstagramPostIds.has(item.selectedInstagramPost)) {
        issues.push(`${label} selected Instagram embed is not in the source gallery`)
      }
    }
  }

  return issues
}

export function validateItemMediaSelections(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string[] {
  const issues: string[] = []
  for (let dayIndex = 0; dayIndex < draft.days.length; dayIndex += 1) {
    const day = draft.days[dayIndex]
    const dayPrefix = `Day ${dayIndex + 1}`
    issues.push(
      ...validateItemMediaRows(
        day.whereStaying,
        relatedByBlockType,
        (index) => `${dayPrefix} — Where you're staying (${index + 1})`,
      ),
      ...validateItemMediaRows(
        day.items,
        relatedByBlockType,
        (index) => `${dayPrefix} — Stop ${index + 1}`,
      ),
    )
  }
  return issues
}
