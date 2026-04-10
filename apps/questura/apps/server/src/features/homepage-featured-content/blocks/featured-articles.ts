import type { Block } from 'payload'

import { HOMEPAGE_FEATURED_CONTENT_COLLECTIONS } from '../types'

export const FeaturedArticlesBlock: Block = {
  slug: 'featured-articles',
  labels: {
    singular: 'Featured Articles',
    plural: 'Featured Articles Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: 1,
      max: 100,
      admin: {
        description: 'How many article slots this block contains.',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS],
      hasMany: true,
      admin: {
        description: 'Articles in display order. Must match the slot count above.',
      },
    },
  ],
}
