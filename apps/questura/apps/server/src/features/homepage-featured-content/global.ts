import type { GlobalConfig } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { FeaturedArticlesBlock } from './blocks/featured-articles'
import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from './service'
import {
  HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
} from './types'

export const HomepageFeaturedContent: GlobalConfig = {
  slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  label: 'Main Homepage',
  access: {
    read: () => true,
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
  },
  admin: {
    description:
      'Main domain homepage built from content blocks. Each block is a curated set of featured articles.',
  },
  fields: [
    {
      name: 'pageBlocks',
      type: 'blocks',
      blocks: [FeaturedArticlesBlock],
      admin: {
        description:
          'Add content blocks to the main homepage. Each block is a Featured Articles section with a configurable number of slots.',
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
            (block as Record<string, unknown>).blockType === 'featured-articles'
          ) {
            const blockRecord = block as Record<string, unknown>
            if (Array.isArray(blockRecord.items) && blockRecord.items.length > 0) {
              const slotCount =
                typeof blockRecord.slotCount === 'number' && blockRecord.slotCount >= 1
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

        return data
      },
    ],
  },
}
