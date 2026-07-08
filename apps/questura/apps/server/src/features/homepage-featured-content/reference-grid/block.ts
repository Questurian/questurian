import type { Block, RelationshipField } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../resolve-page-blocks/lib/section-heading'

export type ReferenceGridBlockConfig = {
  slug: string
  labels: Block['labels']
  slotCounts: {
    min: number
    max: number
  }
  relationTo: RelationshipField['relationTo']
  slotCountDescription: string
  itemsDescription: string
}

export function createReferenceGridBlock(config: ReferenceGridBlockConfig): Block {
  return {
    slug: config.slug,
    labels: config.labels,
    fields: [
      {
        name: 'slotCount',
        type: 'number',
        required: true,
        min: config.slotCounts.min,
        max: config.slotCounts.max,
        admin: {
          description: config.slotCountDescription,
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
        relationTo: config.relationTo,
        hasMany: true,
        admin: {
          description: config.itemsDescription,
        },
      },
    ],
  }
}
