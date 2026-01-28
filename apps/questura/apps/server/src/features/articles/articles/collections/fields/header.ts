import { Field } from 'payload'

export const headerSection: Field = {
  type: 'group',
  name: 'headerSection',
  label: 'Header Content',
  admin: {
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
  fields: [
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media-assets',
      required: true,
      admin: {
        description: 'Hero image displayed at top of article',
      },
    },
    {
      name: 'intro',
      type: 'richText',
      admin: { description: 'Introductory text for the Article' },
    },
  ],
}

