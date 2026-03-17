import type { Field, Where } from 'payload'
import { parseLocationKey } from './locationScope'

export const createLocationRefField = (): Field => ({
  name: 'locationRef',
  type: 'relationship',
  relationTo: 'locations',
  admin: {
    hidden: true,
  },
})

const isCityLocationSelection = (data: unknown): boolean => {
  const locationKey = typeof (data as { location?: unknown } | null)?.location === 'string'
    ? (data as { location?: string } | null)?.location || ''
    : ''

  return parseLocationKey(locationKey).length === 2
}

export const createSharedNeighborhoodsField = (): Field => ({
  name: 'sharedNeighborhoods',
  label: 'Shared Neighborhoods',
  type: 'relationship',
  relationTo: 'locations',
  hasMany: true,
  filterOptions: ({ data }) => {
    const locationKey = typeof data?.location === 'string' ? data.location.trim() : ''

    if (!isCityLocationSelection(data)) {
      return {
        level: {
          equals: 'neighborhood',
        },
      } satisfies Where
    }

    return {
      and: [
        {
          level: {
            equals: 'neighborhood',
          },
        },
        {
          parentKey: {
            equals: locationKey,
          },
        },
      ],
    } satisfies Where
  },
  admin: {
    condition: isCityLocationSelection,
    description:
      'Optional exact neighborhoods within the selected city. When set, article item filters use only these neighborhoods.',
  },
})
