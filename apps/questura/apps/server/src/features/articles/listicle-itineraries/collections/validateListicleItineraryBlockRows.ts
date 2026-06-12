import type { PayloadRequest } from 'payload'
import {
  getMediaMode,
  requiresInstagram,
  requiresPhotos,
} from '../../shared/utils/itemMedia/mediaMode'
import {
  normalizeRelationshipId,
  normalizeRelationshipIds,
  relationshipIdToKey,
} from '../../shared/utils/itemMedia/relationshipIds'
import {
  extractSourceItemMediaIds,
  fetchListicleSourceItem,
  getSourceCollectionForBlockType,
} from '../../shared/utils/itemMedia/sourceItems'
import { validateTourPicks } from '../../shared/utils/tourPicks'

const tourAgencyPriceTiers = ['$', '$$', '$$$', '$$$$'] as const

const isTourAgencyPriceTier = (value: unknown): value is (typeof tourAgencyPriceTiers)[number] => (
  typeof value === 'string'
  && tourAgencyPriceTiers.includes(value as (typeof tourAgencyPriceTiers)[number])
)

const isLatitude = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90
)

const isLongitude = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180
)

const tourAgencyKeyLocationCollections = [
  'dining',
  'accommodations',
  'attractions',
  'nightlife',
  'key-locations',
] as const

type TourAgencyKeyLocationCollection = (typeof tourAgencyKeyLocationCollections)[number]

const isTourAgencyKeyLocationCollection = (
  value: unknown,
): value is TourAgencyKeyLocationCollection => (
  typeof value === 'string'
  && tourAgencyKeyLocationCollections.includes(value as TourAgencyKeyLocationCollection)
)

const normalizePolymorphicRelationship = (value: unknown): {
  relationTo: TourAgencyKeyLocationCollection
  id: string | number
} | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const relationTo = record.relationTo
  if (!isTourAgencyKeyLocationCollection(relationTo)) {
    return null
  }

  const relationshipId = normalizeRelationshipId('value' in record ? record.value : record)
  if (relationshipId === null) {
    return null
  }

  return {
    relationTo,
    id: relationshipId,
  }
}

const isValidAbsoluteUrl = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value.trim()) return false

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export type ComputedItineraryBlock = {
  displayLabel: string
  index: number
  location?: string
}

export type ValidateListicleSection = 'whereStaying' | 'stops'

export async function validateListicleItineraryBlockRows(params: {
  req: PayloadRequest
  blocks: Record<string, unknown>[]
  section: ValidateListicleSection
  labelAt: (index: number) => string
  sourceItemCache: Map<string, Record<string, unknown> | null>
  instagramPostCache: Map<string, boolean>
}): Promise<ComputedItineraryBlock[]> {
  const { req, blocks, section, labelAt, sourceItemCache, instagramPostCache } = params

  const computed: ComputedItineraryBlock[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const itemLabel = labelAt(i)
    const blockType = String(block.blockType ?? '')

    if (!blockType) {
      throw new Error(`${itemLabel} has no block type.`)
    }

    if (section === 'whereStaying') {
      if (blockType === 'itinerary-tour-agency') {
        throw new Error(`${itemLabel} cannot be a tour agency block — use the Stops section.`)
      }
      if (blockType !== 'itinerary-where-staying') {
        throw new Error(`${itemLabel} must be a "Where you're staying" lodging block (got ${blockType}).`)
      }
    }

    if (section === 'stops' && blockType === 'itinerary-where-staying') {
      throw new Error(`${itemLabel} belongs in the Where you're staying field, not Stops.`)
    }

    if (blockType === 'itinerary-tour-agency') {
      const titleValue = typeof block.title === 'string' ? block.title.trim() : ''
      const operatorValue = typeof block.operator === 'string' ? block.operator.trim() : ''
      const priceValue = block.price
      const urlValue = typeof block.url === 'string' ? block.url.trim() : ''
      const tourDurationValue = Number(block.tourDuration)
      const startingPoint = block.startingPoint && typeof block.startingPoint === 'object'
        ? block.startingPoint as Record<string, unknown>
        : null
      const startingPointLabel = typeof startingPoint?.label === 'string'
        ? startingPoint.label.trim()
        : ''
      const startingPointLatitude = Number(startingPoint?.latitude)
      const startingPointLongitude = Number(startingPoint?.longitude)
      const hasStartingPoint = Boolean(
        startingPointLabel
        || startingPoint?.latitude !== undefined
        || startingPoint?.longitude !== undefined,
      )
      const instagramPostId = normalizeRelationshipId(block.instagramPost)
      const keyLocationRows = Array.isArray(block.keyLocations)
        ? block.keyLocations as Record<string, unknown>[]
        : []

      if (!titleValue) {
        throw new Error(`${itemLabel} must include a tour title.`)
      }

      if (!operatorValue) {
        throw new Error(`${itemLabel} must include a tour operator.`)
      }

      if (!urlValue || !isValidAbsoluteUrl(urlValue)) {
        throw new Error(`${itemLabel} must include a valid absolute URL.`)
      }

      if (
        priceValue !== undefined
        && priceValue !== null
        && priceValue !== ''
        && !isTourAgencyPriceTier(priceValue)
      ) {
        throw new Error(`${itemLabel} price must be $, $$, $$$, or $$$$.`)
      }

      if (!Number.isInteger(tourDurationValue) || tourDurationValue < 1 || tourDurationValue > 24) {
        throw new Error(`${itemLabel} must include a tour duration between 1 and 24 hours.`)
      }

      if (hasStartingPoint && (!isLatitude(startingPointLatitude) || !isLongitude(startingPointLongitude))) {
        throw new Error(`${itemLabel} starting point must include valid latitude and longitude.`)
      }

      if (instagramPostId !== null) {
        const cacheKey = relationshipIdToKey(instagramPostId)

        if (!instagramPostCache.has(cacheKey)) {
          try {
            await req.payload.findByID({
              collection: 'instagram-posts',
              id: instagramPostId,
              depth: 0,
            })
            instagramPostCache.set(cacheKey, true)
          } catch {
            instagramPostCache.set(cacheKey, false)
          }
        }

        if (!instagramPostCache.get(cacheKey)) {
          throw new Error(`${itemLabel} Instagram embed could not be loaded.`)
        }
      }

      for (let rowIndex = 0; rowIndex < keyLocationRows.length; rowIndex += 1) {
        const row = keyLocationRows[rowIndex]
        const rowSource = typeof row.source === 'string' ? row.source : ''

        if (rowSource === 'existing') {
          const relationship = normalizePolymorphicRelationship(row.relatedItem)

          if (!relationship) {
            throw new Error(
              `${itemLabel} key location ${rowIndex + 1} must select an existing travel item.`,
            )
          }

          const cacheKey = `${relationship.relationTo}:${relationshipIdToKey(relationship.id)}`
          if (!sourceItemCache.has(cacheKey)) {
            const sourceItem = await fetchListicleSourceItem(req, relationship.relationTo, relationship.id)
            sourceItemCache.set(cacheKey, sourceItem)
          }

          if (!sourceItemCache.get(cacheKey)) {
            throw new Error(
              `${itemLabel} key location ${rowIndex + 1} references an item that could not be loaded.`,
            )
          }

          continue
        }

        if (rowSource === 'manual') {
          const manualTitle = typeof row.title === 'string' ? row.title.trim() : ''
          const latitude = Number(row.latitude)
          const longitude = Number(row.longitude)

          if (!manualTitle || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new Error(
              `${itemLabel} key location ${rowIndex + 1} must include a title, latitude, and longitude.`,
            )
          }

          continue
        }

        throw new Error(
          `${itemLabel} key location ${rowIndex + 1} must be marked as existing or manual.`,
        )
      }

      computed.push({ displayLabel: itemLabel, index: i })
      continue
    }

    const sourceCollection = getSourceCollectionForBlockType(blockType)
    if (!sourceCollection) {
      throw new Error(`${itemLabel} has unsupported block type (${blockType}).`)
    }

    const sourceItemId = normalizeRelationshipId(block.item)
    if (sourceItemId === null) {
      throw new Error(`${itemLabel} must reference a ${sourceCollection} entry.`)
    }

    const cacheKey = `${sourceCollection}:${relationshipIdToKey(sourceItemId)}`
    if (!sourceItemCache.has(cacheKey)) {
      const sourceItem = await fetchListicleSourceItem(req, sourceCollection, sourceItemId)
      sourceItemCache.set(cacheKey, sourceItem)
    }

    const sourceItem = sourceItemCache.get(cacheKey)
    if (!sourceItem) {
      throw new Error(
        `${itemLabel} references a ${sourceCollection} entry that could not be loaded.`,
      )
    }

    if (blockType === 'itinerary-attractions') {
      validateTourPicks({ blockTours: block.tours, sourceItem, itemLabel })
    }

    const mediaMode = getMediaMode(block.mediaMode)
    if (!mediaMode) {
      throw new Error(`${itemLabel} must select a media mode (photos, instagram, or both).`)
    }

    if (mediaMode === 'photos') {
      block.selectedInstagramPost = null
    }

    if (mediaMode === 'instagram') {
      block.selectedPhotos = []
    }

    const selectedPhotoIds = normalizeRelationshipIds(block.selectedPhotos)
    const selectedInstagramPostId = normalizeRelationshipId(block.selectedInstagramPost)

    const { photoIds, instagramPostIds } = extractSourceItemMediaIds(sourceItem)
    const availablePhotoKeys = new Set(photoIds.map(relationshipIdToKey))
    const availableInstagramKeys = new Set(instagramPostIds.map(relationshipIdToKey))

    if (requiresPhotos(mediaMode)) {
      if (selectedPhotoIds.length < 1 || selectedPhotoIds.length > 6) {
        throw new Error(`${itemLabel} must select between 1 and 6 photos.`)
      }

      const invalidPhotoId = selectedPhotoIds.find(
        (photoId) => !availablePhotoKeys.has(relationshipIdToKey(photoId)),
      )

      if (invalidPhotoId !== undefined) {
        throw new Error(
          `${itemLabel} selected photo ${invalidPhotoId} is not in the source gallery.`,
        )
      }
    }

    if (requiresInstagram(mediaMode)) {
      if (selectedInstagramPostId === null) {
        throw new Error(`${itemLabel} must select one Instagram embed.`)
      }

      if (!availableInstagramKeys.has(relationshipIdToKey(selectedInstagramPostId))) {
        throw new Error(
          `${itemLabel} selected Instagram embed is not in the source gallery.`,
        )
      }
    }

    const itemLocation =
      typeof sourceItem.location === 'string' ? sourceItem.location : undefined

    computed.push({ displayLabel: itemLabel, index: i, location: itemLocation })
  }

  return computed
}
