import type { Block } from 'payload'

import { HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX } from '../featured-articles-section-heading'
import { HOMEPAGE_FEATURED_CONTENT_COLLECTIONS } from '../types'

export const FeaturedArticleBlock: Block = {
  slug: 'featured-article',
  labels: {
    singular: 'Featured Article',
    plural: 'Featured Article Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 1,
      max: 1,
      admin: {
        readOnly: true,
        description: 'Single spotlight slot (fixed).',
      },
    },
    {
      name: 'sectionHeading',
      type: 'text',
      required: false,
      maxLength: HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
      admin: {
        description: 'Optional headline shown above this block on the public homepage.',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS],
      hasMany: true,
      admin: {
        description: 'One article or listicle to highlight in the hero layout.',
      },
    },
  ],
}
