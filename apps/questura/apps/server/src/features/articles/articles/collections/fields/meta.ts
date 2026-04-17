import { Field } from 'payload'

export const slug: Field = {
  name: 'slug',
  type: 'text',
  unique: true,
  index: true,
  admin: {
    description: 'URL-friendly identifier (auto-generated from title)',
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

export const author: Field = {
  name: 'author',
  type: 'relationship',
  relationTo: 'users',
  required: true,
  access: {
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
  },
  admin: {
    description: 'Article author (auto-set to current user on creation)',
    position: 'sidebar',
  },
}

export const publishedAt: Field = {
  name: 'publishedAt',
  type: 'date',
  admin: {
    description: 'Publication date (auto-set when published)',
    position: 'sidebar',
    hidden: true,
  },
}
