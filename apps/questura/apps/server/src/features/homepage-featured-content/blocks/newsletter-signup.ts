import type { Block } from 'payload'

import {
  HOMEPAGE_FEATURED_ARTICLES_SECTION_HEADING_MAX,
  HOMEPAGE_FEATURED_ARTICLES_SECTION_SUBHEADING_MAX,
} from '../featured-articles-section-heading'

export const NewsletterSignupBlock: Block = {
  slug: 'newsletter-signup',
  labels: {
    singular: 'Newsletter signup',
    plural: 'Newsletter signup blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: 0,
      max: 0,
      defaultValue: 0,
      admin: {
        readOnly: true,
        description: 'Placeholder block for homepage structure (no curated items).',
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
  ],
}
