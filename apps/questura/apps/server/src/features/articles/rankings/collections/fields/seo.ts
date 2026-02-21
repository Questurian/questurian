import { Field } from 'payload'

export const seo: Field = {
  type: 'group',
  name: 'seoSection',
  label: 'SEO & Metadata',
  admin: {
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
  fields: [
    {
      name: 'seo',
      type: 'relationship',
      relationTo: 'seo-metadata',
      admin: {
        description: 'SEO metadata for search engines and social sharing',
        allowCreate: true,
      },
    },
  ],
}
