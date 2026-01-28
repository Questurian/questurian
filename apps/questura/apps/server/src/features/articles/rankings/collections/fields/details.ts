import { Field } from 'payload'

export const headerSection: Field = {
  type: 'group',
  name: 'header',
  label: 'Header',
  admin: {
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
  fields: [
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media-assets',
      admin: { description: 'Featured image for the ranking' },
    },
    {
      name: 'intro',
      type: 'richText',
      admin: { description: 'Introductory text for the ranking' },
    },
  ],
}

