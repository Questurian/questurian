import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../resolve-page-blocks/lib/section-heading'
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
      name: 'sectionSubheading',
      type: 'text',
      required: false,
      maxLength: HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
      admin: {
        description: 'Optional supporting line under the section heading.',
      },
    },
    {
      name: 'slot3Layout',
      /** Postgres identifier cap (63); full path + `slot3_layout` exceeded it. */
      dbName: 's3_lo',
      type: 'select',
      required: false,
      defaultValue: 'hero-left',
      options: [
        {
          label: 'Hero left — two stacked on the right',
          value: 'hero-left',
        },
        {
          label: 'Three columns — large feature in the center',
          value: 'featured-center',
        },
      ],
      admin: {
        description:
          'Only applies when slot count is 3. Pick how the three article slots are arranged.',
        condition: (_data, siblingData) =>
          typeof (siblingData as { slotCount?: unknown })?.slotCount === 'number'
          && (siblingData as { slotCount: number }).slotCount === 3,
      },
    },
    {
      name: 'slot4Layout',
      dbName: 's4_lo',
      type: 'select',
      required: false,
      defaultValue: 'sidebar-stack',
      options: [
        {
          label: 'Hero column + stacked sidebar (default)',
          value: 'sidebar-stack',
        },
        {
          label: 'Lead row: text + image, then three columns',
          value: 'one-over-three',
        },
      ],
      admin: {
        description: 'Only applies when slot count is 4.',
        condition: (_data, siblingData) =>
          typeof (siblingData as { slotCount?: unknown })?.slotCount === 'number'
          && (siblingData as { slotCount: number }).slotCount === 4,
      },
    },
    {
      name: 'slot5Layout',
      dbName: 's5_lo',
      type: 'select',
      required: false,
      defaultValue: 'card-grid',
      options: [
        {
          label: 'Card grid (default)',
          value: 'card-grid',
        },
        {
          label: 'Magazine — hero + sidebar stack',
          value: 'hero-sidebar',
        },
      ],
      admin: {
        description: 'Only applies when slot count is 5.',
        condition: (_data, siblingData) =>
          typeof (siblingData as { slotCount?: unknown })?.slotCount === 'number'
          && (siblingData as { slotCount: number }).slotCount === 5,
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
