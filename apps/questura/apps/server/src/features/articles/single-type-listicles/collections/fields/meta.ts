import { Field } from 'payload'

const tripIntentValues = ['explore', 'stay', 'move'] as const

type TripIntent = (typeof tripIntentValues)[number]

const normalizeTripIntentValues = (value?: unknown): TripIntent[] => {
  if (!Array.isArray(value)) return ['explore']

  const normalized = [...new Set(
    value
      .filter((candidate): candidate is string => typeof candidate === 'string')
      .map((candidate) => candidate.toLowerCase())
      .filter((candidate): candidate is TripIntent => (tripIntentValues as readonly string[]).includes(candidate)),
  )]

  return normalized.length > 0 ? normalized : ['explore']
}

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

export const tripIntent: Field = {
  name: 'tripIntent',
  type: 'select',
  required: true,
  hasMany: true,
  options: [
    { label: 'Explore', value: 'explore' },
    { label: 'Stay', value: 'stay' },
    { label: 'Move', value: 'move' },
  ],
  defaultValue: ['explore'],
  validate: (value) => {
    const normalized = normalizeTripIntentValues(value)
    if (!Array.isArray(value) || normalized.length === 0) {
      return 'Select at least one trip intent.'
    }

    const invalidEntries = value
      .filter((candidate): candidate is string => typeof candidate === 'string')
      .filter((candidate) => !(tripIntentValues as readonly string[]).includes(candidate.toLowerCase()))

    if (invalidEntries.length > 0) {
      return 'tripIntent contains invalid values.'
    }

    return true
  },
  admin: {
    position: 'sidebar',
    description: 'Article travel intent (choose one or more).',
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
