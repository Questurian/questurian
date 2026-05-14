import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../resolve-page-blocks/lib/section-heading'

export const LocationGridBlock: Block = {
  slug: 'location-grid',
  labels: {
    singular: 'Location Grid',
    plural: 'Location Grid Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: 4,
      max: 8,
      admin: {
        description: 'How many child locations this grid contains.',
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
      name: 'mediaAspect',
      dbName: 'lg_ma',
      type: 'select',
      required: false,
      defaultValue: 'rectangle',
      options: [
        { label: 'Rectangle (wide)', value: 'rectangle' },
        { label: 'Square', value: 'square' },
        { label: 'Portrait (taller)', value: 'portrait' },
      ],
      admin: {
        description:
          'Shape of each location card image: wide banner, square, or a modest portrait crop.',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: 'locations',
      hasMany: true,
      admin: {
        description:
          'Locations in display order. Main homepages can select cities; city homepages can select neighborhoods.',
      },
    },
  ],
}
