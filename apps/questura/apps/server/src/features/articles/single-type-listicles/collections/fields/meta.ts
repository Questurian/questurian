import { staffUser } from '@/features/auth/lib/staff-user'
import { Field } from 'payload'
import { validateSlugAgainstReserved } from '@/shared/lib/reservedSlugs'

export const slug: Field = {
  name: 'slug',
  type: 'text',
  unique: true,
  index: true,
  required: true,
  validate: (value: unknown) => validateSlugAgainstReserved(value),
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
      if (staffUser(req.user)?.role === 'writer') {
        return data?.status !== 'published'
      }
      return true
    },
    update: ({ req, data }) => {
      if (staffUser(req.user)?.role === 'writer') {
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
  // Public authorship lives on Authors, not on the staff account (ADR-0007),
  // so a byline survives the author's account being disabled or deleted.
  relationTo: 'authors',
  required: true,
  access: {
    update: ({ req }) => {
      const role = staffUser(req.user)?.role
      return role === 'admin' || role === 'editor'
    },
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
