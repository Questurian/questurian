import type { Block } from 'payload'

import { HOMEPAGE_FEATURED_CONTENT_COLLECTIONS } from '../types'
import {
  EDITORIAL_FEATURE_DESCRIPTION_MAX,
  EDITORIAL_FEATURE_KICKER_MAX,
  EDITORIAL_FEATURE_SLOT_COUNTS,
  EDITORIAL_FEATURE_TITLE_MAX,
} from './constants'

export const EditorialFeatureBlock: Block = {
  slug: 'editorial-feature',
  labels: {
    singular: 'Editorial Feature',
    plural: 'Editorial Feature Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: 2,
      max: 6,
      validate: (value: unknown) =>
        EDITORIAL_FEATURE_SLOT_COUNTS.includes(value as 2 | 3 | 4 | 6)
          ? true
          : 'Must be 2, 3, 4, or 6 articles.',
      admin: { description: 'Related article count: 2, 3, 4, or 6.' },
    },
    {
      name: 'featureKicker',
      type: 'text',
      maxLength: EDITORIAL_FEATURE_KICKER_MAX,
      admin: { description: 'Short label above the feature title.' },
    },
    {
      name: 'featureTitle',
      type: 'text',
      maxLength: EDITORIAL_FEATURE_TITLE_MAX,
      admin: { description: 'Editorial feature title.' },
    },
    {
      name: 'featureDescription',
      type: 'textarea',
      maxLength: EDITORIAL_FEATURE_DESCRIPTION_MAX,
      admin: { description: 'One plain-text paragraph.' },
    },
    {
      name: 'featureMediaSet',
      type: 'relationship',
      relationTo: 'media-sets',
      admin: { description: 'Feature image. Portrait and wide variants are required to publish.' },
    },
    {
      name: 'linkedLocation',
      type: 'relationship',
      relationTo: 'locations',
      admin: { description: 'Optional enabled, published Location Homepage destination.' },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS],
      hasMany: true,
      admin: { description: 'Related articles in display order.' },
    },
  ],
}
