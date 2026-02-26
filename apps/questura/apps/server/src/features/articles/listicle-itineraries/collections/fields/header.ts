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
      name: 'intro',
      type: 'richText',
      required: true,
      admin: {
        description: 'Intro text shown below the header title',
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media-assets',
      admin: {
        description: 'Optional featured image for the itinerary header',
      },
    },
  ],
}
