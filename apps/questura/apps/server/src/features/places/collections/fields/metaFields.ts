import type { Field } from 'payload'

export const placeMetaFields: Field[] = [
  {
    name: 'createdBy',
    type: 'relationship',
    relationTo: 'users',
    admin: {
      readOnly: true,
      hidden: true,
      position: 'sidebar',
    },
  },
  {
    name: 'status',
    type: 'select',
    options: [
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
    ],
    defaultValue: 'draft',
    admin: { position: 'sidebar' },
  },
]
