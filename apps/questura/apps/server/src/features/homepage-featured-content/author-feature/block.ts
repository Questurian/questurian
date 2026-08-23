import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../resolve-page-blocks/lib/section-heading'
import { HOMEPAGE_FEATURED_CONTENT_COLLECTIONS } from '../types'
import {
  AUTHOR_FEATURE_IMAGE_STYLES,
  AUTHOR_FEATURE_MAX_AUTHORS,
  AUTHOR_FEATURE_MOTION_STYLES,
  AUTHOR_FEATURE_SLOT_COUNTS,
  AUTHOR_FEATURE_SPOTLIGHT_NOTE_MAX,
  DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE,
  DEFAULT_AUTHOR_FEATURE_MOTION_STYLE,
} from './constants'

export const AuthorFeatureBlock: Block = {
  slug: 'author-feature',
  labels: {
    singular: 'Author Feature',
    plural: 'Author Feature Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: 1,
      max: 6,
      validate: (value: unknown) =>
        AUTHOR_FEATURE_SLOT_COUNTS.includes(value as 1 | 2 | 3 | 4 | 6)
          ? true
          : 'Must be 1, 2, 3, 4, or 6 articles.',
      admin: { description: 'Related article count: 1, 2, 3, 4, or 6.' },
    },
    {
      name: 'sectionHeading',
      type: 'text',
      maxLength: HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
      admin: { description: 'Optional headline shown above this block.' },
    },
    {
      name: 'sectionSubheading',
      type: 'text',
      maxLength: HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
      admin: { description: 'Optional supporting line under the section heading.' },
    },
    {
      name: 'imageStyle',
      type: 'select',
      defaultValue: DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE,
      options: AUTHOR_FEATURE_IMAGE_STYLES.map((value) => ({ label: value, value })),
      admin: { description: 'Public image treatment for author portraits.' },
    },
    {
      name: 'motionStyle',
      type: 'select',
      defaultValue: DEFAULT_AUTHOR_FEATURE_MOTION_STYLE,
      options: AUTHOR_FEATURE_MOTION_STYLES.map((value) => ({ label: value, value })),
      admin: { description: 'Public motion treatment.' },
    },
    {
      name: 'authorCards',
      type: 'array',
      minRows: 1,
      maxRows: AUTHOR_FEATURE_MAX_AUTHORS,
      admin: {
        description:
          'One to four Authors. Mark one as emphasized; each image must be one of that Author’s uploaded images.',
      },
      fields: [
        {
          name: 'author',
          type: 'relationship',
          relationTo: 'authors',
          required: true,
        },
        {
          name: 'image',
          type: 'relationship',
          relationTo: 'media-sets',
          required: false,
          admin: {
            description: 'Selected image from this Author’s uploaded images.',
          },
        },
        {
          name: 'spotlightNote',
          type: 'textarea',
          maxLength: AUTHOR_FEATURE_SPOTLIGHT_NOTE_MAX,
          admin: { description: 'Optional homepage-specific note, max 160 characters.' },
        },
        {
          name: 'isEmphasized',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Main Author in this block. First Author is used if none checked.',
          },
        },
      ],
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS],
      hasMany: true,
      admin: { description: 'Articles by the selected Authors in display order.' },
    },
  ],
}
