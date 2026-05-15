import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { getBlocksForType } from '../blocks'
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
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import { languageField } from '@/shared/i18n/languageField'
import { revalidateArticleCollection } from '@/features/public-revalidation/revalidate-client'
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

const articleRevalidation = revalidateArticleCollection('single-type-listicles')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const extractRelationshipId = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (!isRecord(value)) return null

  const id = value.id
  if (typeof id === 'string' || typeof id === 'number') return id

  const relationshipValue = value.value
  if (typeof relationshipValue === 'string' || typeof relationshipValue === 'number') {
    return relationshipValue
  }

  if (isRecord(relationshipValue)) {
    const nestedId = relationshipValue.id
    if (typeof nestedId === 'string' || typeof nestedId === 'number') {
      return nestedId
    }
  }

  return null
}

const relationshipIdsEqual = (
  left: string | number | null,
  right: string | number | null,
): boolean => left === right || (left !== null && right !== null && String(left) === String(right))

const textOrEmpty = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const mergeGroup = (
  original: unknown,
  next: unknown,
): Record<string, unknown> => ({
  ...(isRecord(original) ? original : {}),
  ...(isRecord(next) ? next : {}),
})

const clearMatchingImageValue = (
  value: unknown,
  staleUrls: Set<string>,
): { value: unknown; changed: boolean; removed: boolean } => {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized && staleUrls.has(normalized)) {
      return { value: undefined, changed: true, removed: true }
    }
    return { value, changed: false, removed: false }
  }

  if (Array.isArray(value)) {
    let changed = false
    const nextItems: unknown[] = []

    for (const item of value) {
      const cleared = clearMatchingImageValue(item, staleUrls)
      changed = changed || cleared.changed
      if (!cleared.removed) {
        nextItems.push(cleared.value)
      }
    }

    return {
      value: nextItems,
      changed,
      removed: nextItems.length === 0,
    }
  }

  if (isRecord(value)) {
    const url = textOrEmpty(value.url)
    const contentUrl = textOrEmpty(value.contentUrl)
    if ((url && staleUrls.has(url)) || (contentUrl && staleUrls.has(contentUrl))) {
      return { value: undefined, changed: true, removed: true }
    }
  }

  return { value, changed: false, removed: false }
}

const clearMatchingStructuredDataImages = (
  value: unknown,
  staleUrls: Set<string>,
): { value: unknown; changed: boolean } => {
  if (Array.isArray(value)) {
    let changed = false
    const nextItems = value.map((item) => {
      const result = clearMatchingStructuredDataImages(item, staleUrls)
      changed = changed || result.changed
      return result.value
    })
    return { value: nextItems, changed }
  }

  if (!isRecord(value)) {
    return { value, changed: false }
  }

  let changed = false
  const nextValue: Record<string, unknown> = {}

  for (const [key, childValue] of Object.entries(value)) {
    if (key === 'image') {
      const cleared = clearMatchingImageValue(childValue, staleUrls)
      changed = changed || cleared.changed
      if (!cleared.removed) {
        nextValue[key] = cleared.value
      }
      continue
    }

    const result = clearMatchingStructuredDataImages(childValue, staleUrls)
    changed = changed || result.changed
    nextValue[key] = result.value
  }

  return { value: nextValue, changed }
}

const clearStaleSocialImagesOnFeaturedImageChange: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
}) => {
  if (!data || operation !== 'update') return data

  const nextHeader = isRecord(data.header) ? data.header : null
  if (!nextHeader || !Object.prototype.hasOwnProperty.call(nextHeader, 'featuredImage')) {
    return data
  }

  const previousHeader = isRecord(originalDoc?.header) ? originalDoc.header : null
  const previousFeaturedImageId = extractRelationshipId(previousHeader?.featuredImage)
  const nextFeaturedImageId = extractRelationshipId(nextHeader.featuredImage)

  if (relationshipIdsEqual(previousFeaturedImageId, nextFeaturedImageId)) {
    return data
  }

  const originalSeo = isRecord(originalDoc?.seoSection) ? originalDoc.seoSection : {}
  const inputSeo = isRecord(data.seoSection) ? data.seoSection : {}
  const originalOpenGraph = isRecord(originalSeo.openGraph) ? originalSeo.openGraph : {}
  const inputOpenGraph = isRecord(inputSeo.openGraph) ? inputSeo.openGraph : {}
  const originalTwitterCard = isRecord(originalSeo.twitterCard) ? originalSeo.twitterCard : {}
  const inputTwitterCard = isRecord(inputSeo.twitterCard) ? inputSeo.twitterCard : {}

  const nextSeo = mergeGroup(originalSeo, inputSeo)
  const nextOpenGraph = mergeGroup(originalOpenGraph, inputOpenGraph)
  const nextTwitterCard = mergeGroup(originalTwitterCard, inputTwitterCard)
  const staleUrls = new Set<string>()

  const originalOpenGraphImageUrl = textOrEmpty(originalOpenGraph.imageUrl)
  const nextOpenGraphImageUrl = textOrEmpty(nextOpenGraph.imageUrl)
  if (originalOpenGraphImageUrl && nextOpenGraphImageUrl === originalOpenGraphImageUrl) {
    nextOpenGraph.imageUrl = null
    staleUrls.add(originalOpenGraphImageUrl)
  }

  const originalTwitterImageUrl = textOrEmpty(originalTwitterCard.imageUrl)
  const nextTwitterImageUrl = textOrEmpty(nextTwitterCard.imageUrl)
  if (originalTwitterImageUrl && nextTwitterImageUrl === originalTwitterImageUrl) {
    nextTwitterCard.imageUrl = null
    staleUrls.add(originalTwitterImageUrl)
  }

  nextSeo.openGraph = nextOpenGraph
  nextSeo.twitterCard = nextTwitterCard

  const structuredData = Object.prototype.hasOwnProperty.call(inputSeo, 'structuredData')
    ? inputSeo.structuredData
    : originalSeo.structuredData

  if (staleUrls.size > 0 && structuredData !== undefined && structuredData !== null) {
    const clearedStructuredData = clearMatchingStructuredDataImages(structuredData, staleUrls)
    if (clearedStructuredData.changed) {
      nextSeo.structuredData = clearedStructuredData.value
    }
  }

  data.seoSection = nextSeo

  return data
}

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

    title,
    location,
    locationRef,
    slug,
    sharedNeighborhoods,
    listicleType,
    targetItemCount,
    step1UiWrapper,

    headerSection,
    items,
    seo,

    status,
    languageField,
    author,
    publishedAt,
    articleType,
  ],
  hooks: {
    beforeChange: [
      clearStaleSocialImagesOnFeaturedImageChange,
      async ({ data, req, operation }) => {
        if (operation === 'create' && req.user?.id) {
          data.author = req.user.id
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

        if (data?.status === 'published') {
          const slug = typeof data?.slug === 'string' ? data.slug.trim() : ''
          if (!slug) {
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
              ? (seoSection.metaDescription as string).trim()
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
    afterChange: [articleRevalidation.afterChange],
    afterDelete: [articleRevalidation.afterDelete],
  },
}
