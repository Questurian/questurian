import type { FilterOptionsProps, Where } from 'payload'
import { getLocationScope } from '@/shared/location/server/locationScope'

export const createLocationFilter = (_: string) => {
  return async ({ data, req }: FilterOptionsProps): Promise<Where> => {
    const parentLocation = data?.location as string | undefined

    if (!parentLocation) {
      return {
        status: { equals: 'published' },
      } satisfies Where
    }

    const scope = await getLocationScope(req.payload, parentLocation)

    if (!scope.keys.length && !scope.refs.length) {
      return {
        and: [{ status: { equals: 'published' } }, { location: { equals: parentLocation } }],
      } satisfies Where
    }

    const locationClauses: Where[] = []

    if (scope.keys.length) {
      locationClauses.push({
        location: {
          in: scope.keys,
        },
      })
    }

    if (scope.refs.length) {
      locationClauses.push({
        locationRef: {
          in: scope.refs,
        },
      })
    }

    return {
      and: [{ status: { equals: 'published' } }, { or: locationClauses }],
    } satisfies Where
  }
}
