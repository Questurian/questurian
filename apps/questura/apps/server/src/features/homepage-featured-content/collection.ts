import type { CollectionConfig } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { FeaturedArticlesBlock } from './blocks/featured-articles'
import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from './types'
import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from './service'

export const LocationHomepages: CollectionConfig = {
  slug: 'location-homepages',
  labels: {
    singular: 'Location Homepage',
    plural: 'Location Homepages',
  },
  admin: {
    group: 'Content',
    description:
      'Opt-in curated homepages for city and neighborhood pages. Each homepage is built from page blocks.',
    defaultColumns: ['location', 'isEnabled', 'updatedAt'],
  },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
    delete: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
  },
  fields: [
    {
      name: 'location',
      type: 'relationship',
      relationTo: 'locations',
      required: true,
      index: true,
      filterOptions: {
        level: { in: ['city', 'neighborhood'] },
      },
      admin: {
        description:
          'City or neighborhood location only. Each location can only have one homepage.',
      },
    },
    {
      name: 'isEnabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Toggle this location homepage on or off without deleting it.',
      },
    },
    {
      name: 'pageBlocks',
      type: 'blocks',
      blocks: [FeaturedArticlesBlock],
      admin: {
        description:
          'Add sections to build this location page. Currently: Featured Articles (10 slots). More block types can be added here in the future.',
      },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, originalDoc, operation }) => {
        // 1. Enforce city/neighborhood level (filterOptions only applies to the admin UI, not API)
        if (data?.location) {
          const locationId =
            typeof data.location === 'object' && data.location !== null
              ? (data.location as Record<string, unknown>).id
              : data.location

          const locationDoc = (await req.payload.findByID({
            collection: 'locations',
            id: locationId as string | number,
            depth: 0,
            overrideAccess: true,
          })) as { level?: string } | null

          if (!locationDoc || locationDoc.level === 'country') {
            throw new Error(
              'Location homepages can only be created for city or neighborhood locations.',
            )
          }
        }

        // 2. Enforce one homepage per location (Payload doesn't support unique on relationship fields)
        if (
          data?.location &&
          (operation === 'create' ||
            (originalDoc &&
              String(
                typeof data.location === 'object' && data.location !== null
                  ? (data.location as Record<string, unknown>).id
                  : data.location,
              ) !== String(typeof originalDoc.location === 'object' && originalDoc.location !== null
                ? (originalDoc.location as Record<string, unknown>).id
                : originalDoc.location)))
        ) {
          const locationId =
            typeof data.location === 'object' && data.location !== null
              ? (data.location as Record<string, unknown>).id
              : data.location

          const existing = await req.payload.find({
            collection: 'location-homepages',
            where: { location: { equals: locationId } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })

          const isDuplicate =
            existing.totalDocs > 0 &&
            (operation === 'create' ||
              (existing.docs[0] as unknown as Record<string, unknown> | undefined)?.id !== originalDoc?.id)

          if (isDuplicate) {
            throw new Error('A homepage already exists for this location.')
          }
        }

        // 3. Validate featured-articles blocks when pageBlocks is present
        if (Array.isArray(data?.pageBlocks)) {
          for (const block of data.pageBlocks) {
            if (
              typeof block === 'object' &&
              block !== null &&
              (block as Record<string, unknown>).blockType === 'featured-articles'
            ) {
              const blockRecord = block as Record<string, unknown>
              if (Array.isArray(blockRecord.items) && blockRecord.items.length > 0) {
                const slotCount = typeof blockRecord.slotCount === 'number' && blockRecord.slotCount >= 1
                  ? Math.trunc(blockRecord.slotCount)
                  : HOMEPAGE_FEATURED_CONTENT_SLOTS
                const refs = normalizeHomepageFeaturedInput(blockRecord.items)
                await validateHomepageFeaturedItems(req.payload, refs, {
                  allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
                  slotCount,
                })
                blockRecord.items = buildHomepageFeaturedGlobalData(refs).items
              }
            }
          }
        }

        return data
      },
    ],
  },
}
