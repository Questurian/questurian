import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../featured-articles-section-heading'
import { HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT } from '../types'

export const QuesturianMapsBlock: Block = {
  slug: 'questurian-maps',
  labels: {
    singular: 'Questurian Maps',
    plural: 'Questurian Maps Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
      max: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
      defaultValue: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
      admin: {
        description: 'Always six single-type listicles in a 2×3 grid.',
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
      relationTo: 'single-type-listicles',
      hasMany: true,
      admin: {
        description: 'Single-type listicles in display order.',
      },
    },
  ],
}
