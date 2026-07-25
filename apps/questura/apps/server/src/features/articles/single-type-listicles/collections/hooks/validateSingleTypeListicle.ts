import type { CollectionBeforeValidateHook } from 'payload'
import { getBlocksForType } from '../../blocks'
import {
  getMediaMode,
  requiresInstagram,
  requiresPhotos,
} from '../../../shared/utils/itemMedia/mediaMode'
import {
  normalizeRelationshipId,
  normalizeRelationshipIds,
  relationshipIdToKey,
} from '../../../shared/utils/itemMedia/relationshipIds'
import {
  extractSourceItemMediaIds,
  fetchListicleSourceItem,
  getSourceCollectionForBlockType,
} from '../../../shared/utils/itemMedia/sourceItems'
import { validateTourPicks } from '../../../shared/utils/tourPicks'
import {
  getArticleLocationScope,
  isLocationWithinArticleScope,
  validateSharedNeighborhoodSelection,
} from '@/shared/location/server/articleLocationScope'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const validateSingleTypeListicle: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  const sharedNeighborhoodValidation = await validateSharedNeighborhoodSelection(req.payload, {
    location: data?.location,
    sharedNeighborhoods: data?.sharedNeighborhoods,
  })

  if (sharedNeighborhoodValidation !== true) {
    throw new Error(sharedNeighborhoodValidation)
  }

  if ((operation === 'create' || operation === 'update') && !data?.step1_complete) {
    throw new Error(
      'Please complete setup: title, location, listicle type, and target list size',
    )
  }

  const count = Number(data?.targetItemCount)
  if (!Number.isFinite(count) || count < 1 || count > 50) {
    throw new Error('Target list size must be a number between 1 and 50')
  }

  if (data?.listicleType && data?.items && Array.isArray(data.items)) {
    const validBlockSlugs = getBlocksForType(data.listicleType).map((block) => block.slug)
    data.items = data.items.filter(
      (item) => item?.blockType && validBlockSlugs.includes(item.blockType),
    )
  }

  const itemCount = Array.isArray(data?.items) ? data.items.length : 0

  if (itemCount > count) {
    throw new Error(
      `This list has ${itemCount} items, but target list size is ${count}. Reduce items before saving.`,
    )
  }

  if (data?.status === 'published' && itemCount !== count) {
    throw new Error(
      `Publishing requires exactly ${count} items. Current item count is ${itemCount}.`,
    )
  }

  if (data?.status === 'published') {
    const requiredSlug = typeof data?.slug === 'string' ? data.slug.trim() : ''
    if (!requiredSlug) {
      throw new Error('Published listicles must have a slug.')
    }

    const header = isRecord(data?.header) ? data.header : null
    if (!header?.featuredImage && !header?.featuredMediaSet) {
      throw new Error(
        'Published listicles must have a featured image or media set (Header section).',
      )
    }

    const seoSection = isRecord(data?.seoSection) ? data.seoSection : null
    const metaDesc =
      typeof seoSection?.metaDescription === 'string'
        ? seoSection.metaDescription.trim()
        : ''
    if (!metaDesc) {
      throw new Error(
        'Published listicles must have a meta description (SEO & Metadata tab).',
      )
    }
    if (metaDesc.length < 50) {
      throw new Error(
        `Meta description is ${metaDesc.length} characters — at least 50 required for indexing.`,
      )
    }
  }

  if (data?.items && Array.isArray(data.items)) {
    const parentLocation = data?.location
    const locationScope = await getArticleLocationScope(req.payload, {
      location: data?.location,
      sharedNeighborhoods: data?.sharedNeighborhoods,
    })
    const sourceItemCache = new Map<string, Record<string, unknown> | null>()
    const seenSourceItems = new Map<string, number>()

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      if (!isRecord(item)) {
        continue
      }

      const sourceCollection = getSourceCollectionForBlockType(item.blockType)
      if (!sourceCollection) {
        continue
      }

      const sourceItemId = normalizeRelationshipId(item.item)
      if (sourceItemId === null) {
        throw new Error(`Item ${i + 1} must reference a ${sourceCollection} entry.`)
      }

      const cacheKey = `${sourceCollection}:${relationshipIdToKey(sourceItemId)}`
      const firstUse = seenSourceItems.get(cacheKey)
      if (firstUse !== undefined) {
        throw new Error(
          `Item ${i + 1} references the same ${sourceCollection} entry as item ${firstUse + 1}. Each venue can only appear once per list.`,
        )
      }
      seenSourceItems.set(cacheKey, i)

      if (!sourceItemCache.has(cacheKey)) {
        const sourceItem = await fetchListicleSourceItem(req, sourceCollection, sourceItemId)
        sourceItemCache.set(cacheKey, sourceItem)
      }

      const sourceItem = sourceItemCache.get(cacheKey)
      if (!sourceItem) {
        throw new Error(
          `Item ${i + 1} references a ${sourceCollection} entry that could not be loaded.`,
        )
      }

      if (item.blockType === 'data-attractions') {
        validateTourPicks({
          blockTours: item.tours,
          sourceItem,
          itemLabel: `Item ${i + 1}`,
        })
      }

      const mediaMode = getMediaMode(item.mediaMode)
      if (!mediaMode) {
        throw new Error(
          `Item ${i + 1} must select a media mode (photos, instagram, or both).`,
        )
      }

      if (mediaMode === 'photos') {
        item.selectedInstagramPost = null
      }

      if (mediaMode === 'instagram') {
        item.selectedPhotos = []
      }

      const selectedPhotoIds = normalizeRelationshipIds(item.selectedPhotos)
      const selectedInstagramPostId = normalizeRelationshipId(item.selectedInstagramPost)
      const { photoIds, instagramPostIds } = extractSourceItemMediaIds(sourceItem)
      const availablePhotoKeys = new Set(photoIds.map(relationshipIdToKey))
      const availableInstagramKeys = new Set(instagramPostIds.map(relationshipIdToKey))

      if (requiresPhotos(mediaMode)) {
        if (selectedPhotoIds.length < 1 || selectedPhotoIds.length > 6) {
          throw new Error(`Item ${i + 1} must select between 1 and 6 photos.`)
        }

        const invalidPhotoId = selectedPhotoIds.find(
          (photoId) => !availablePhotoKeys.has(relationshipIdToKey(photoId)),
        )

        if (invalidPhotoId !== undefined) {
          throw new Error(
            `Item ${i + 1} selected photo ${invalidPhotoId} is not in the source gallery.`,
          )
        }
      }

      if (requiresInstagram(mediaMode)) {
        if (selectedInstagramPostId === null) {
          throw new Error(`Item ${i + 1} must select one Instagram embed.`)
        }

        if (!availableInstagramKeys.has(relationshipIdToKey(selectedInstagramPostId))) {
          throw new Error(
            `Item ${i + 1} selected Instagram embed is not in the source gallery.`,
          )
        }
      }

      if (parentLocation && typeof sourceItem.location === 'string') {
        if (!isLocationWithinArticleScope(sourceItem.location, locationScope)) {
          throw new Error(
            locationScope.exactNeighborhoods
              ? `Item ${i + 1} location does not match the selected neighborhoods.`
              : `Item ${i + 1} location does not match listicle location (${parentLocation}).`,
          )
        }
      }
    }
  }

  return data
}
