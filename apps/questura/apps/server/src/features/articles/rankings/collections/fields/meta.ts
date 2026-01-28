import { Field } from 'payload'

export const slug: Field = {
  name: 'slug',
  type: 'text',
  unique: true,
  index: true,
  admin: {
    description: 'URL-friendly identifier',
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
    hidden: true,
  },
}

export const status: Field = {
  name: 'status',
  type: 'select',
  options: [
    { label: 'Draft', value: 'draft' },
    { label: 'Published', value: 'published' },
  ],
  defaultValue: 'draft',
  access: {
    create: ({ req, data }) => {
      if (req.user?.role === 'writer') {
        return data?.status !== 'published'
      }
      return true
    },
    update: ({ req, data }) => {
      if (req.user?.role === 'writer') {
        return data?.status !== 'published'
      }
      return true
    },
  },
  admin: {
    position: 'sidebar',
  },
}

