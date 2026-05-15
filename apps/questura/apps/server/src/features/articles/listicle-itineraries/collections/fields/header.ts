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
      name: 'featuredMediaSet',
      type: 'relationship',
      relationTo: 'media-sets',
      admin: {
        description:
          'Preferred: media set whose variants drive public image rendering. When set, used in preference to featuredImage.',
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media-assets',
      admin: {
        description:
          'Legacy featured image. Used as fallback when featuredMediaSet is not set. New itineraries should use featuredMediaSet.',
      },
    },
  ],
}
