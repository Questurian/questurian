import type { Field, Payload } from 'payload'
import { validateLocationSlugAgainstCategories } from '@/shared/lib/categoryLocationCollision'
import {
  validateCountrySlugAgainstReserved,
  validateSlugAgainstReserved,
} from '@/shared/lib/reservedSlugs'

export const levelOptions = [
  { label: 'Country', value: 'country' },
  { label: 'City', value: 'city' },
  { label: 'Neighborhood', value: 'neighborhood' },
]

export const locationFields: Field[] = [
  {
    name: 'level',
    type: 'select',
    options: levelOptions,
    required: true,
    admin: {
      description: 'Hierarchy level for this location entry.',
    },
  },
  {
    name: 'country',
    type: 'text',
    required: true,
    validate: (async (value: unknown, options: { req?: { payload: Payload } }) => {
      const reserved = validateCountrySlugAgainstReserved(value)
      if (reserved !== true) return reserved
      return validateLocationSlugAgainstCategories(value, options?.req)
    }) as never,
    admin: {
      description: 'Normalized key segment (e.g., "colombia").',
    },
  },
  {
    name: 'city',
    type: 'text',
    required: false,
    validate: (async (
      value: unknown,
      options: {
        data?: Record<string, unknown>
        req?: { payload: Payload }
      },
    ) => {
      const level = (options?.data as { level?: string } | undefined)?.level
      if (level !== 'city' && level !== 'neighborhood') return true
      const reserved = validateSlugAgainstReserved(value)
      if (reserved !== true) return reserved
      return validateLocationSlugAgainstCategories(value, options?.req)
    }) as never,
    admin: {
      condition: (data) => data?.level === 'city' || data?.level === 'neighborhood',
      description: 'Normalized key segment (e.g., "bogota").',
    },
  },
  {
    name: 'neighborhood',
    type: 'text',
    admin: {
      condition: (data) => data?.level === 'neighborhood',
      description: 'Normalized key segment (e.g., "santa-teresita").',
    },
  },
  {
    name: 'locationKey',
    type: 'text',
    unique: true,
    index: true,
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'Canonical key derived from the normalized segments.',
    },
  },
  {
    name: 'parentKey',
    type: 'text',
    index: true,
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'Location key of the direct parent (null for countries).',
    },
  },
  {
    name: 'countryName',
    type: 'text',
    required: true,
    admin: {
      description: 'Display name for UI (e.g., "Colombia").',
    },
  },
  {
    name: 'cityName',
    type: 'text',
    admin: {
      condition: (data) => data?.level === 'city' || data?.level === 'neighborhood',
      description: 'Display name for UI (e.g., "Bogota").',
    },
  },
  {
    name: 'neighborhoodName',
    type: 'text',
    admin: {
      condition: (data) => data?.level === 'neighborhood',
      description: 'Display name for UI (e.g., "Santa Teresita").',
    },
  },
  {
    name: 'coverImage',
    type: 'relationship',
    relationTo: 'media-sets',
    index: true,
    admin: {
      description: 'Primary image for location cards and homepage grids.',
    },
  },
]
