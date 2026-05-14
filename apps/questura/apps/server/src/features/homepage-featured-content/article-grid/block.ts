import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../resolve-page-blocks/lib/section-heading'
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
      min: 4,
      max: 8,
      validate: (value: unknown) => {
        if (value === 4 || value === 8) return true
        return 'Must be 4 or 8 cards.'
      },
      admin: {
        description:
          '4 or 8 slots. For 4 slots, pick row vs 2×2 layout below. 8 slots: always four columns × two rows, square images.',
      },
    },
    {
      name: 'articleGridFourLayout',
      dbName: 'ag_l4',
      type: 'select',
      required: false,
      defaultValue: 'four-across',
      options: [
        { label: 'One row × four — wide (16:10) images', value: 'four-across' },
        { label: '2×2 grid — square images', value: 'two-by-two' },
      ],
      admin: {
        description: 'Applies only when slot count is 4.',
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
      name: 'sectionSubheading',
      type: 'text',
      required: false,
      maxLength: HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
      admin: {
        description: 'Optional supporting line under the section heading.',
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
