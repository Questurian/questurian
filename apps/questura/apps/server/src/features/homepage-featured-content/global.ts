import type { GlobalConfig } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { ArticleGridBlock } from './blocks/article-grid'
import { FeaturedArticlesBlock } from './blocks/featured-articles'
import { HotelGridBlock } from './blocks/hotel-grid'
import { LocationGridBlock } from './blocks/location-grid'
import {
  buildHotelGridGlobalData,
  normalizeHotelGridInput,
  validateHotelGridItems,
} from './hotel-grid-service'
import {
  buildLocationGridGlobalData,
  MAIN_LOCATION_GRID_SCOPE,
  normalizeLocationGridInput,
  validateLocationGridItems,
} from './location-grid-service'
import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from './service'
import {
  HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
} from './types'

function isCuratedBlockType(
  value: unknown,
): value is 'featured-articles' | 'article-grid' | 'location-grid' | 'hotel-grid' {
  return value === 'featured-articles' || value === 'article-grid' || value === 'location-grid' || value === 'hotel-grid'
}

export const HomepageFeaturedContent: GlobalConfig = {
  slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  label: 'Main Homepage',
  access: {
    read: () => true,
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
  },
  admin: {
    description:
      'Main domain homepage built from content blocks. Each block is a curated article module with its own layout.',
  },
  fields: [
    {
      name: 'pageBlocks',
      type: 'blocks',
      blocks: [FeaturedArticlesBlock, ArticleGridBlock, LocationGridBlock, HotelGridBlock],
      admin: {
        description:
          'Add content blocks to the main homepage. Available blocks include Featured Articles, Article Grid, and Location Grid.',
      },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        if (!Array.isArray(data?.pageBlocks)) return data

        for (const block of data.pageBlocks) {
          if (
            typeof block === 'object' &&
            block !== null &&
            isCuratedBlockType((block as Record<string, unknown>).blockType)
          ) {
            const blockRecord = block as Record<string, unknown>
            if (Array.isArray(blockRecord.items) && blockRecord.items.length > 0) {
              const slotCount =
                typeof blockRecord.slotCount === 'number' && blockRecord.slotCount >= 1
                  ? Math.trunc(blockRecord.slotCount)
                  : HOMEPAGE_FEATURED_CONTENT_SLOTS
              if (blockRecord.blockType === 'location-grid') {
                const refs = normalizeLocationGridInput(blockRecord.items)
                await validateLocationGridItems(req.payload, refs, {
                  scope: MAIN_LOCATION_GRID_SCOPE,
                  slotCount,
                })
                blockRecord.items = buildLocationGridGlobalData(refs).items
              } else if (blockRecord.blockType === 'hotel-grid') {
                const refs = normalizeHotelGridInput(blockRecord.items)
                await validateHotelGridItems(req.payload, refs, {
                  allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
                  slotCount,
                })
                blockRecord.items = buildHotelGridGlobalData(refs).items
              } else {
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
