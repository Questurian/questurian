import type { GlobalConfig } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from './service'
import {
  HOMEPAGE_FEATURED_CONTENT_COLLECTIONS,
  HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
} from './types'

export const HomepageFeaturedContent: GlobalConfig = {
  slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  label: 'Homepage Featured Content',
  access: {
    read: () => true,
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
  },
  admin: {
    description: 'Ordered homepage content slots shared with the front page and AI Blog Writer.',
  },
  fields: [
    {
      name: 'items',
      type: 'relationship',
      relationTo: [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS],
      hasMany: true,
      required: true,
      admin: {
        description: 'Select exactly 10 items in homepage order.',
      },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        const refs = normalizeHomepageFeaturedInput(data?.items)

        await validateHomepageFeaturedItems(req.payload, refs, {
          allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        })

        return {
          ...data,
          ...buildHomepageFeaturedGlobalData(refs),
        }
      },
    ],
  },
}
