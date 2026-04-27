import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../featured-articles-section-heading'
import {
  HOMEPAGE_TOUR_GRID_MAX_SLOTS,
  HOMEPAGE_TOUR_GRID_MIN_SLOTS,
} from '../types'

export const TourGridBlock: Block = {
  slug: 'tour-grid',
  labels: {
    singular: 'Tour Grid',
    plural: 'Tour Grid Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: HOMEPAGE_TOUR_GRID_MIN_SLOTS,
      max: HOMEPAGE_TOUR_GRID_MAX_SLOTS,
      admin: {
        description: 'How many tour cards this block contains.',
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
      relationTo: 'tours',
      hasMany: true,
      admin: {
        description: 'Tours in display order.',
      },
    },
  ],
}
