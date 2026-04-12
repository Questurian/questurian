import type { Block } from 'payload'

import { HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX } from '../featured-articles-section-heading'
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
      min: 3,
      max: 9,
      admin: {
        description: 'How many article slots this block contains.',
      },
    },
    {
      name: 'sectionHeading',
      type: 'text',
      required: false,
      maxLength: HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
      admin: {
        description:
          'Optional heading for this section on the public homepage (e.g. “Featured reporting”).',
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
