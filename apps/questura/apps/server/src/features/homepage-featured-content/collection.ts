import type { CollectionConfig } from 'payload'

import { ArticleGridBlock } from './blocks/article-grid'
import { FeaturedArticleBlock } from './blocks/featured-article'
import { FeaturedArticlesBlock } from './blocks/featured-articles'
import { HotelGridBlock } from './blocks/hotel-grid'
import { LocationGridBlock } from './blocks/location-grid'
import { QuesturianMapsBlock } from './blocks/questurian-maps'
import { WhereToEatDrinkBlock } from './blocks/where-to-eat-drink'
import { ThingsToDoAttractionsBlock } from './blocks/things-to-do-attractions'
import { ThingsToDoListiclesBlock } from './blocks/things-to-do-listicles'
import { NewsletterSignupBlock } from './blocks/newsletter-signup'
import {
  resolveLocationGridScopeFromLocation,
} from './location-grid-service'
import { normalizePageBlocksArrayInPlace } from './page-blocks-validation'
import { ALL_HOMEPAGE_PAGE_BLOCKS_FIELDS } from './types'

const HOMEPAGE_BLOCK_TYPES = [
  FeaturedArticleBlock,
  FeaturedArticlesBlock,
  ArticleGridBlock,
  LocationGridBlock,
  QuesturianMapsBlock,
  HotelGridBlock,
  WhereToEatDrinkBlock,
  ThingsToDoListiclesBlock,
  ThingsToDoAttractionsBlock,
  NewsletterSignupBlock,
] as const

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
      blocks: [...HOMEPAGE_BLOCK_TYPES],
      label: 'Explore — page blocks',
      admin: {
        description:
          'Explore mode: sections for this location homepage.',
      },
    },
    {
      name: 'pageBlocksStay',
      type: 'blocks',
      blocks: [...HOMEPAGE_BLOCK_TYPES],
      label: 'Stay — page blocks',
      admin: {
        description: 'Stay mode: curated independently from Explore.',
      },
    },
    {
      name: 'pageBlocksMove',
      type: 'blocks',
      blocks: [...HOMEPAGE_BLOCK_TYPES],
      label: 'Move — page blocks',
      admin: {
        description: 'Move mode: curated independently from Explore.',
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
          data?.location
          && (operation === 'create'
            || (originalDoc
              && String(
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
            existing.totalDocs > 0
            && (operation === 'create'
              || (existing.docs[0] as unknown as Record<string, unknown> | undefined)?.id
                !== originalDoc?.id)

          if (isDuplicate) {
            throw new Error('A homepage already exists for this location.')
          }
        }

        const rawLocation = data?.location ?? originalDoc?.location
        const rawLocationId =
          typeof rawLocation === 'object' && rawLocation !== null
            ? (rawLocation as Record<string, unknown>).id
            : rawLocation
        const resolvedLocation =
          typeof rawLocation === 'object' && rawLocation !== null && 'level' in rawLocation
            ? rawLocation as { level?: unknown; locationKey?: unknown }
            : rawLocationId
              ? await req.payload.findByID({
                  collection: 'locations',
                  id: rawLocationId as string | number,
                  depth: 0,
                  overrideAccess: true,
                })
              : null
        const locationGridScope = resolveLocationGridScopeFromLocation(
          resolvedLocation as { level?: unknown; locationKey?: unknown } | null,
        )

        // 3. Validate supported page blocks for each mode field present
        if (data) {
          for (const field of ALL_HOMEPAGE_PAGE_BLOCKS_FIELDS) {
            const arr = data[field as keyof typeof data]
            if (Array.isArray(arr)) {
              await normalizePageBlocksArrayInPlace(req, arr as unknown[], locationGridScope)
            }
          }
        }

        return data
      },
    ],
  },
}
