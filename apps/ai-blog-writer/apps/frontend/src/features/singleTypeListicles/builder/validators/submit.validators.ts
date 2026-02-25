import { getBlockTypeForListicleType } from '../../api'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import {
  getRelatedInstagramPostIds,
  getRelatedPhotoIds,
  isMediaMode,
  requiresInstagram,
  requiresPhotos,
} from '../utils/item-media.utils'
import { validateStep1 } from './setup.validators'

export function validateSubmit(
  draft: SingleTypeListicleDraft,
  selectedLocationRefId: number | null,
  targetStatus: 'draft' | 'published',
  relatedItems: RelatedItemOption[],
): string | null {
  const stepIssues = validateStep1(draft)
  if (stepIssues.length > 0) return stepIssues.join('. ')

  if (draft.items.length > draft.targetItemCount) {
    return `This list has ${draft.items.length} items, but target size is ${draft.targetItemCount}`
  }

  if (targetStatus === 'published' && draft.items.length !== draft.targetItemCount) {
    return `Publishing requires exactly ${draft.targetItemCount} items. Current item count is ${draft.items.length}`
  }

  if (!draft.listicleType) return 'Listicle type is required'

  const expectedBlockType = getBlockTypeForListicleType(draft.listicleType)
  if (draft.items.some((item) => item.blockType !== expectedBlockType)) {
    return 'Item block types do not match selected listicle type'
  }

  for (let index = 0; index < draft.items.length; index += 1) {
    const item = draft.items[index]

    if (!item.item) {
      return `Item ${index + 1} is missing related entry selection`
    }

    const relatedItem = relatedItems.find((entry) => entry.id === item.item)
    if (!relatedItem) {
      return `Item ${index + 1} selected related entry is unavailable for current listicle filters`
    }

    if (!isMediaMode(item.mediaMode)) {
      return `Item ${index + 1} must select a media mode (photos, instagram, or both)`
    }

    const availablePhotoIds = new Set(getRelatedPhotoIds(relatedItem))
    const availableInstagramPostIds = new Set(getRelatedInstagramPostIds(relatedItem))

    if (requiresPhotos(item.mediaMode)) {
      if (item.selectedPhotos.length < 1 || item.selectedPhotos.length > 6) {
        return `Item ${index + 1} must select between 1 and 6 photos`
      }

      const invalidPhotoId = item.selectedPhotos.find((photoId) => !availablePhotoIds.has(photoId))
      if (invalidPhotoId !== undefined) {
        return `Item ${index + 1} selected photo ${invalidPhotoId} is not in the source gallery`
      }
    }

    if (requiresInstagram(item.mediaMode)) {
      if (!item.selectedInstagramPost) {
        return `Item ${index + 1} must select one Instagram embed`
      }

      if (!availableInstagramPostIds.has(item.selectedInstagramPost)) {
        return `Item ${index + 1} selected Instagram embed is not in the source gallery`
      }
    }
  }

  if (!selectedLocationRefId) return 'Select a valid location'

  return null
}
