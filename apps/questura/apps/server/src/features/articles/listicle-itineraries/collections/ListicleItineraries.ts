import { CollectionConfig } from 'payload'
import {
  calculateEndMinutes,
  durationToMinutes,
  toMinutesFromMidnight,
} from '../blocks/utils/timeField'
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
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import { isLocationWithinScope } from '@/shared/location/server/locationScope'
import {
  step1Complete,
  inUpdateMode,
  slug,
  title,
  location,
  locationRef,
  dayAudience,
  itineraryStart,
  itineraryEnd,
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

const formatMinutes = (minutes: number): string => {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const ListicleItineraries: CollectionConfig = {
  slug: 'listicle-itineraries',
  labels: {
    singular: 'Listicle Itinerary',
    plural: 'Listicle Itineraries',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'location', 'dayAudience', 'status', 'author'],
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
    dayAudience,
    itineraryStart,
    itineraryEnd,
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
      async ({ data, originalDoc, operation, req }) => {
        const merged = {
          ...(originalDoc ?? {}),
          ...(data ?? {}),
        } as Record<string, unknown>

        if ((operation === 'create' || operation === 'update') && !getValue<boolean>(merged, 'step1_complete')) {
          throw new Error(
            'Please complete setup: title, location, day type, itinerary start time, and itinerary end time.',
          )
        }

        const requiredDayAudience = getValue<string>(merged, 'dayAudience')
        if (!requiredDayAudience) {
          throw new Error('Day type is required: anyday, weekday, or weekend.')
        }

        const startHour = getValue<number>(merged, 'itineraryStartHour')
        const startMinute = getValue<string>(merged, 'itineraryStartMinute')
        const startPeriod = getValue<string>(merged, 'itineraryStartPeriod')
        const endHour = getValue<number>(merged, 'itineraryEndHour')
        const endMinute = getValue<string>(merged, 'itineraryEndMinute')
        const endPeriod = getValue<string>(merged, 'itineraryEndPeriod')

        if (
          typeof startHour !== 'number' ||
          !startMinute ||
          !startPeriod ||
          typeof endHour !== 'number' ||
          !endMinute ||
          !endPeriod
        ) {
          throw new Error('Itinerary start and end times are required.')
        }

        const itineraryStartMinutes = toMinutesFromMidnight(startHour, startMinute, startPeriod)
        const itineraryEndMinutes = toMinutesFromMidnight(endHour, endMinute, endPeriod)

        if (itineraryEndMinutes <= itineraryStartMinutes) {
          throw new Error('Itinerary end time must be later than itinerary start time within the same day.')
        }

        const itineraryWindowMinutes = itineraryEndMinutes - itineraryStartMinutes
        if (itineraryWindowMinutes > 1440) {
          throw new Error('Itinerary window must be within 24 hours.')
        }

        const itemsValue = Array.isArray(getValue<unknown[]>(merged, 'items'))
          ? (getValue<unknown[]>(merged, 'items') as Record<string, unknown>[])
          : []

        type ComputedBlock = {
          start: number
          end: number
          blockType: string
          index: number
          location?: string
        }

        const computed: ComputedBlock[] = []
        const sourceItemCache = new Map<string, Record<string, unknown> | null>()

        for (let i = 0; i < itemsValue.length; i++) {
          const block = itemsValue[i]
          const blockType = String(block.blockType ?? '')
          const blockStartHour = Number(block.timeHour)
          const blockStartMinute = String(block.timeMinute ?? '')
          const blockStartPeriod = String(block.timePeriod ?? '')
          const blockDurationHours = Number(block.durationHours ?? 0)
          const blockDurationMinutes = String(block.durationMinutes ?? '0')

          if (!blockType) {
            throw new Error(`Item ${i + 1} has no block type.`)
          }

          if (!Number.isFinite(blockStartHour) || !blockStartMinute || !blockStartPeriod) {
            throw new Error(`Item ${i + 1} is missing a complete start time.`)
          }

          const blockStart = toMinutesFromMidnight(blockStartHour, blockStartMinute, blockStartPeriod)
          const blockDuration = durationToMinutes(blockDurationHours, blockDurationMinutes)

          if (blockDuration <= 0) {
            throw new Error(`Item ${i + 1} must have a duration greater than 0 minutes.`)
          }

          const blockEnd = calculateEndMinutes(blockStart, blockDuration)

          if (blockStart < itineraryStartMinutes || blockStart > itineraryEndMinutes) {
            throw new Error(
              `Item ${i + 1} starts at ${formatMinutes(blockStart)} outside the itinerary window ${formatMinutes(
                itineraryStartMinutes,
              )}-${formatMinutes(itineraryEndMinutes)}.`,
            )
          }

          if (blockEnd > itineraryEndMinutes) {
            throw new Error(
              `Item ${i + 1} ends at ${formatMinutes(blockEnd)} outside the itinerary window ${formatMinutes(
                itineraryStartMinutes,
              )}-${formatMinutes(itineraryEndMinutes)}.`,
            )
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

          computed.push({ start: blockStart, end: blockEnd, blockType, index: i, location: itemLocation })
        }

        const parentLocation = getValue<string>(merged, 'location')
        if (parentLocation) {
          for (const block of computed) {
            if (block.location && !isLocationWithinScope(block.location, parentLocation)) {
              throw new Error(
                `Item ${block.index + 1} location does not match itinerary location (${parentLocation}).`,
              )
            }
          }
        }

        for (let i = 1; i < computed.length; i++) {
          const prev = computed[i - 1]
          const curr = computed[i]

          if (curr.start < prev.start) {
            throw new Error(
              `Itinerary items must be in chronological order. Item ${curr.index + 1} starts before item ${prev.index + 1}.`,
            )
          }

          if (curr.start < prev.end) {
            throw new Error(
              `Time conflict: item ${curr.index + 1} starts at ${formatMinutes(curr.start)} before item ${prev.index + 1} ends at ${formatMinutes(prev.end)}.`,
            )
          }
        }

        const currentStatus = getValue<string>(merged, 'status')
        if (currentStatus === 'published') {
          if (!computed.length) {
            throw new Error('Publishing requires at least one itinerary item.')
          }

          const first = computed[0]
          const last = computed[computed.length - 1]

          if (first.start !== itineraryStartMinutes) {
            throw new Error(
              `Published itineraries must start exactly at ${formatMinutes(itineraryStartMinutes)}.`,
            )
          }

          if (last.end !== itineraryEndMinutes) {
            throw new Error(
              `Published itineraries must end exactly at ${formatMinutes(itineraryEndMinutes)}.`,
            )
          }

          for (let i = 1; i < computed.length; i++) {
            const prev = computed[i - 1]
            const curr = computed[i]

            if (curr.start !== prev.end) {
              throw new Error(
                `Published itineraries cannot have gaps: item ${prev.index + 1} ends at ${formatMinutes(
                  prev.end,
                )} but item ${curr.index + 1} starts at ${formatMinutes(curr.start)}.`,
              )
            }
          }
        }

        return data
      },
    ],
  },
}
