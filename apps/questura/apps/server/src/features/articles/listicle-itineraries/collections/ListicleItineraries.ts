import { CollectionConfig } from 'payload'
import {
  extractSourceItemMediaIds,
  fetchListicleSourceItem,
  getMediaMode,
  getSourceCollectionForBlockType,
  normalizeRelationshipId,
  normalizeRelationshipIds,
  relationshipIdToKey,
  requiresInstagram,
  requiresPhotos,
} from '../../shared/utils/itemMedia'
import {
  getArticleLocationScope,
  isLocationWithinArticleScope,
  syncSharedNeighborhoodsField,
  validateSharedNeighborhoodSelection,
} from '@/shared/location/server/articleLocationScope'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import {
  step1Complete,
  inUpdateMode,
  slug,
  title,
  location,
  locationRef,
  sharedNeighborhoods,
  step1UiWrapper,
  headerSection,
  items,
  seo,
  status,
  author,
  publishedAt,
  articleType,
} from './fields'

const getValue = <T,>(data: Record<string, unknown> | undefined, key: string): T | undefined => {
  return data?.[key] as T | undefined
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

const tourAgencyPriceTiers = ['$', '$$', '$$$', '$$$$'] as const

const isTourAgencyPriceTier = (value: unknown): value is (typeof tourAgencyPriceTiers)[number] => (
  typeof value === 'string' && tourAgencyPriceTiers.includes(value as (typeof tourAgencyPriceTiers)[number])
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

export const ListicleItineraries: CollectionConfig = {
  slug: 'listicle-itineraries',
  labels: {
    singular: 'Listicle Itinerary',
    plural: 'Listicle Itineraries',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'location', 'status', 'author'],
    group: 'Articles',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) {
        return {
          status: {
            equals: 'published',
          },
        }
      }

      if (
        req.user.role === 'admin' ||
        req.user.role === 'editor' ||
        req.user.role === 'writer'
      ) {
        return true
      }

      return false
    },
    create: ({ req }) => {
      return (
        req.user?.role === 'editor' ||
        req.user?.role === 'admin' ||
        req.user?.role === 'writer'
      )
    },
    update: ({ req }) => {
      const user = req.user
      if (!user) return false

      if (user.role === 'admin' || user.role === 'editor') return true

      if (user.role === 'writer') {
        return {
          author: {
            equals: user.id,
          },
        }
      }

      return false
    },
    delete: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
  },
  fields: [
    step1Complete,
    inUpdateMode,
    slug,

    title,
    location,
    locationRef,
    sharedNeighborhoods,
    step1UiWrapper,

    headerSection,
    items,
    seo,

    status,
    author,
    publishedAt,
    articleType,
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create' && req.user?.id) {
          data.author = req.user.id
        }

        if (data?.title && !data?.slug) {
          data.slug = data.title
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, '')
        }

        if (data?.status === 'published' && !data?.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }

        data.articleType = 'listicle-itinerary'

        return data
      },
    ],
    beforeValidate: [
      syncLocationFields(),
      syncSharedNeighborhoodsField(),
      async ({ data, originalDoc, operation, req }) => {
        const merged = {
          ...(originalDoc ?? {}),
          ...(data ?? {}),
        } as Record<string, unknown>

        const sharedNeighborhoodValidation = await validateSharedNeighborhoodSelection(req.payload, {
          location: getValue<string>(merged, 'location'),
          sharedNeighborhoods: getValue<unknown>(merged, 'sharedNeighborhoods'),
        })

        if (sharedNeighborhoodValidation !== true) {
          throw new Error(sharedNeighborhoodValidation)
        }

        if (
          (operation === 'create' || operation === 'update')
          && !getValue<boolean>(merged, 'step1_complete')
        ) {
          throw new Error('Please complete setup: title and location.')
        }

        const requiredTitle = typeof getValue<string>(merged, 'title') === 'string'
          ? getValue<string>(merged, 'title')?.trim()
          : ''
        if (!requiredTitle) {
          throw new Error('Title is required.')
        }

        const requiredLocation = getValue<string>(merged, 'location')
        if (!requiredLocation) {
          throw new Error('Location is required.')
        }

        const itemsValue = Array.isArray(getValue<unknown[]>(merged, 'items'))
          ? (getValue<unknown[]>(merged, 'items') as Record<string, unknown>[])
          : []

        type ComputedBlock = {
          index: number
          location?: string
        }

        const computed: ComputedBlock[] = []
        const sourceItemCache = new Map<string, Record<string, unknown> | null>()
        const instagramPostCache = new Map<string, boolean>()

        for (let i = 0; i < itemsValue.length; i++) {
          const block = itemsValue[i]
          const blockType = String(block.blockType ?? '')

          if (!blockType) {
            throw new Error(`Item ${i + 1} has no block type.`)
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
              throw new Error(`Item ${i + 1} must include a tour title.`)
            }

            if (!operatorValue) {
              throw new Error(`Item ${i + 1} must include a tour operator.`)
            }

            if (!urlValue || !isValidAbsoluteUrl(urlValue)) {
              throw new Error(`Item ${i + 1} must include a valid absolute URL.`)
            }

            if (
              priceValue !== undefined
              && priceValue !== null
              && priceValue !== ''
              && !isTourAgencyPriceTier(priceValue)
            ) {
              throw new Error(`Item ${i + 1} price must be $, $$, $$$, or $$$$.`)
            }

            if (!Number.isInteger(tourDurationValue) || tourDurationValue < 1 || tourDurationValue > 24) {
              throw new Error(`Item ${i + 1} must include a tour duration between 1 and 24 hours.`)
            }

            if (hasStartingPoint && (!isLatitude(startingPointLatitude) || !isLongitude(startingPointLongitude))) {
              throw new Error(`Item ${i + 1} starting point must include valid latitude and longitude.`)
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
                throw new Error(`Item ${i + 1} Instagram embed could not be loaded.`)
              }
            }

            for (let rowIndex = 0; rowIndex < keyLocationRows.length; rowIndex += 1) {
              const row = keyLocationRows[rowIndex]
              const rowSource = typeof row.source === 'string' ? row.source : ''

              if (rowSource === 'existing') {
                const relationship = normalizePolymorphicRelationship(row.relatedItem)

                if (!relationship) {
                  throw new Error(
                    `Item ${i + 1} key location ${rowIndex + 1} must select an existing travel item.`,
                  )
                }

                const cacheKey = `${relationship.relationTo}:${relationshipIdToKey(relationship.id)}`
                if (!sourceItemCache.has(cacheKey)) {
                  const sourceItem = await fetchListicleSourceItem(req, relationship.relationTo, relationship.id)
                  sourceItemCache.set(cacheKey, sourceItem)
                }

                if (!sourceItemCache.get(cacheKey)) {
                  throw new Error(
                    `Item ${i + 1} key location ${rowIndex + 1} references an item that could not be loaded.`,
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
                    `Item ${i + 1} key location ${rowIndex + 1} must include a title, latitude, and longitude.`,
                  )
                }

                continue
              }

              throw new Error(
                `Item ${i + 1} key location ${rowIndex + 1} must be marked as existing or manual.`,
              )
            }

            computed.push({ index: i })
            continue
          }

          const sourceCollection = getSourceCollectionForBlockType(blockType)
          if (!sourceCollection) {
            throw new Error(`Item ${i + 1} has unsupported block type (${blockType}).`)
          }

          const sourceItemId = normalizeRelationshipId(block.item)
          if (sourceItemId === null) {
            throw new Error(`Item ${i + 1} must reference a ${sourceCollection} entry.`)
          }

          const cacheKey = `${sourceCollection}:${relationshipIdToKey(sourceItemId)}`
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

          const mediaMode = getMediaMode(block.mediaMode)
          if (!mediaMode) {
            throw new Error(`Item ${i + 1} must select a media mode (photos, instagram, or both).`)
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

          const itemLocation =
            typeof sourceItem.location === 'string' ? sourceItem.location : undefined

          computed.push({ index: i, location: itemLocation })
        }

        const parentLocation = getValue<string>(merged, 'location')
        if (parentLocation) {
          const locationScope = await getArticleLocationScope(req.payload, {
            location: parentLocation,
            sharedNeighborhoods: getValue<unknown>(merged, 'sharedNeighborhoods'),
          })

          for (const block of computed) {
            if (block.location && !isLocationWithinArticleScope(block.location, locationScope)) {
              throw new Error(
                locationScope.exactNeighborhoods
                  ? `Item ${block.index + 1} location does not match the selected neighborhoods.`
                  : `Item ${block.index + 1} location does not match itinerary location (${parentLocation}).`,
              )
            }
          }
        }

        const currentStatus = getValue<string>(merged, 'status')
        if (currentStatus === 'published' && !computed.length) {
          throw new Error('Publishing requires at least one itinerary item.')
        }

        return data
      },
    ],
  },
}
