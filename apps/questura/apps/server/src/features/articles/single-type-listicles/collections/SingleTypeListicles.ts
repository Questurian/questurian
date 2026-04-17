import { CollectionConfig } from 'payload'
import { getBlocksForType } from '../blocks'
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
} from '../blocks/utils/itemMedia'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import {
  getArticleLocationScope,
  isLocationWithinArticleScope,
  syncSharedNeighborhoodsField,
  validateSharedNeighborhoodSelection,
} from '@/shared/location/server/articleLocationScope'
import {
  step1Complete,
  inUpdateMode,
  slug,
  title,
  location,
  locationRef,
  sharedNeighborhoods,
  listicleType,
  targetItemCount,
  step1UiWrapper,
  headerSection,
  items,
  seo,
  status,
  author,
  publishedAt,
  articleType,
} from './fields'

export const SingleTypeListicles: CollectionConfig = {
  slug: 'single-type-listicles',
  labels: {
    singular: 'Single Type Listicle',
    plural: 'Single Type Listicles',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'location', 'listicleType', 'targetItemCount', 'status'],
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
    listicleType,
    targetItemCount,
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

        data.articleType = 'single-type-listicle'

        return data
      },
    ],
    beforeValidate: [
      syncLocationFields(),
      syncSharedNeighborhoodsField(),
      async ({ data, operation, req }) => {
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
          const validBlockSlugs = getBlocksForType(data.listicleType).map((b) => b.slug)

          data.items = data.items.filter((item) => {
            if (!item?.blockType || !validBlockSlugs.includes(item.blockType)) {
              return false
            }
            return true
          })
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

        if (data?.items && Array.isArray(data.items)) {
          const parentLocation = data?.location
          const locationScope = await getArticleLocationScope(req.payload, {
            location: data?.location,
            sharedNeighborhoods: data?.sharedNeighborhoods,
          })
          const sourceItemCache = new Map<string, Record<string, unknown> | null>()

          for (let i = 0; i < data.items.length; i++) {
            const item = data.items[i]
            if (!item || typeof item !== 'object') {
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
      },
    ],
  },
}
