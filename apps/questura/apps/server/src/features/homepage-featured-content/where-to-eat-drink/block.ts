import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../resolve-page-blocks/lib/section-heading'
import {
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
} from '../types'

export const WhereToEatDrinkBlock: Block = {
  slug: 'where-to-eat-drink',
  labels: {
    singular: 'Where to Eat & Drink',
    plural: 'Where to Eat & Drink Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
      max: HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
      admin: {
        description: 'How many dining listicles this block contains.',
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
      relationTo: ['single-type-listicles'] as const,
      hasMany: true,
      admin: {
        description: 'Dining single-type listicles in display order.',
      },
    },
  ],
}
