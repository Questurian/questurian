import type { Block } from 'payload'

import { HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX } from '../featured-articles-section-heading'
import {
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
} from '../types'

export const ThingsToDoListiclesBlock: Block = {
  slug: 'things-to-do-listicles',
  labels: {
    singular: 'Things to Do — Listicles',
    plural: 'Things to Do — Listicle Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
      max: HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
      admin: {
        description: 'How many attraction listicles this block contains.',
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
      relationTo: 'single-type-listicles',
      hasMany: true,
      admin: {
        description: 'Single-type listicles with data type Attractions only.',
      },
    },
  ],
}
