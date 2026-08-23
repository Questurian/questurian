import { validations, type Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../resolve-page-blocks/lib/section-heading'
import { HOMEPAGE_FEATURED_CONTENT_COLLECTIONS } from '../types'
import {
  AUTHOR_FEATURE_DESCRIPTION_MODES,
  AUTHOR_FEATURE_EXPERTISE_AREA_MAX,
  AUTHOR_FEATURE_EXPERTISE_MODES,
  AUTHOR_FEATURE_MOTION_STYLES,
  AUTHOR_FEATURE_SELECTED_EXPERTISE_MAX,
  AUTHOR_FEATURE_SLOT_COUNTS,
  AUTHOR_FEATURE_SPOTLIGHT_NOTE_MAX,
  AUTHOR_FEATURE_STORED_IMAGE_STYLES,
  DEFAULT_AUTHOR_FEATURE_DESCRIPTION_MODE,
  DEFAULT_AUTHOR_FEATURE_EXPERTISE_MODE,
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
      options: AUTHOR_FEATURE_STORED_IMAGE_STYLES.map((value) => ({
        label: value === 'mixed' ? 'mixed (legacy)' : value,
        value,
      })),
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
      name: 'descriptionMode',
      type: 'select',
      defaultValue: DEFAULT_AUTHOR_FEATURE_DESCRIPTION_MODE,
      options: AUTHOR_FEATURE_DESCRIPTION_MODES.map((value) => ({ label: value, value })),
      admin: { description: 'Use the Author profile bio or custom homepage description.' },
    },
    {
      name: 'expertiseMode',
      type: 'select',
      defaultValue: DEFAULT_AUTHOR_FEATURE_EXPERTISE_MODE,
      options: AUTHOR_FEATURE_EXPERTISE_MODES.map((value) => ({ label: value, value })),
      admin: { description: 'Use all profile expertise or an editor-selected subset.' },
    },
    {
      name: 'selectedExpertise',
      type: 'array',
      maxRows: AUTHOR_FEATURE_SELECTED_EXPERTISE_MAX,
      admin: { description: 'Expertise labels selected for this homepage feature.' },
      fields: [
        {
          name: 'area',
          type: 'text',
          required: true,
          maxLength: AUTHOR_FEATURE_EXPERTISE_AREA_MAX,
        },
      ],
    },
    {
      name: 'authorCards',
      type: 'array',
      minRows: 1,
      validate: (value, options) => {
        const lengthResult = validations.array(value, options)
        if (lengthResult !== true) return lengthResult
        if (!Array.isArray(value) || value.length <= 1) return true

        return Array.isArray(options.previousValue) &&
          JSON.stringify(value) === JSON.stringify(options.previousValue)
          ? true
          : 'Author Feature supports exactly one Author.'
      },
      admin: {
        description:
          'Exactly one Author. Legacy extra rows remain readable but are ignored by the editor and public API.',
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
            hidden: true,
            description: 'Legacy compatibility field. Author Feature now supports one Author only.',
          },
        },
      ],
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS],
      hasMany: true,
      admin: { description: 'Articles by the selected Author in display order.' },
    },
  ],
}
