import { CollectionConfig } from 'payload'
import { getBlocksForType } from '../blocks'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import {
  step1Complete,
  inUpdateMode,
  slug,
  title,
  location,
  locationRef,
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
      async ({ data, operation }) => {
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

        if (data?.location && data?.items && Array.isArray(data.items)) {
          const parentLocation = data.location

          for (let i = 0; i < data.items.length; i++) {
            const item = data.items[i]
            if (item?.item && typeof item.item !== 'string') {
              const itemLocation = item.item.location
              if (itemLocation && itemLocation !== parentLocation) {
                throw new Error(
                  `Item ${i + 1} location does not match listicle location (${parentLocation}).`,
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
