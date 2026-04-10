import type { Block } from 'payload'

import { HOMEPAGE_FEATURED_CONTENT_COLLECTIONS } from '../types'

export const ArticleGridBlock: Block = {
  slug: 'article-grid',
  labels: {
    singular: 'Article Grid',
    plural: 'Article Grid Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: 3,
      max: 5,
      admin: {
        description: 'How many cards this compact article grid contains.',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS],
      hasMany: true,
      admin: {
        description: 'Articles in display order for the compact grid.',
      },
    },
  ],
}
