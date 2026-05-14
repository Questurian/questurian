import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../resolve-page-blocks/lib/section-heading'
import {
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
} from '../types'

export const ThingsToDoAttractionsBlock: Block = {
  slug: 'things-to-do-attractions',
  labels: {
    singular: 'Things to Do — Places',
    plural: 'Things to Do — Places Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
      max: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
      admin: {
        description: 'How many attraction place cards this block contains.',
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
      relationTo: 'attractions',
      hasMany: true,
      admin: {
        description: 'Attraction records in display order.',
      },
    },
  ],
}
