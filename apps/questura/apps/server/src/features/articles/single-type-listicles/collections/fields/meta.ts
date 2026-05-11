import { Field } from 'payload'
import { validateSlugAgainstReserved } from '@/shared/lib/reservedSlugs'

export const slug: Field = {
  name: 'slug',
  type: 'text',
  unique: true,
  index: true,
  required: true,
  validate: (value) => validateSlugAgainstReserved(value),
  admin: {
    description: 'URL-friendly slug (e.g. medellin-digital-nomad-guide-2026)',
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

export const articleType: Field = {
  name: 'articleType',
  type: 'select',
  required: true,
  defaultValue: 'single-type-listicle',
  options: [{ label: 'Single Type Listicle', value: 'single-type-listicle' }],
  admin: {
    readOnly: true,
    position: 'sidebar',
    description: 'Article format type',
  },
}
