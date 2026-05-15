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
      required: true,
      admin: {
        description:
          'Legacy hero image. Used as fallback when featuredMediaSet is not set. New articles should use featuredMediaSet.',
      },
    },
  ],
}
