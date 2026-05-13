import type { Payload } from 'payload'

import type {
  LocationDocLike,
  LocationGridCandidatesResponse,
  LocationGridSearchOptions,
  PayloadFindWhere,
} from '../types'

import { locationGridSelect } from '../constants'
import { normalizeLocationGridCandidate } from '../lib/candidate'
import { isLocationWithinScope } from '../lib/scope'

export async function searchLocationGridCandidates(
  payload: Payload,
  options: LocationGridSearchOptions,
): Promise<LocationGridCandidatesResponse> {
  const scope = options.scope

  if (!scope) {
    throw new Error('Location Grid blocks are only available on city homepages.')
  }

  const query = options.query?.trim() || ''
  const page =
    Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit =
    Number.isFinite(options.limit) && (options.limit || 0) > 0
      ? Math.min(Math.trunc(options.limit!), 50)
      : 24

  const whereClauses: PayloadFindWhere[] = [
    {
      level: {
        equals: scope.childLevel,
      },
    },
  ]

  if (scope.parentKey) {
    whereClauses.push({
      parentKey: {
        equals: scope.parentKey,
      },
    })
  }

  if (query) {
    whereClauses.push({
      or: [
        {
          countryName: {
            like: query,
          },
        },
        {
          cityName: {
            like: query,
          },
        },
        {
          neighborhoodName: {
            like: query,
          },
        },
        {
          locationKey: {
            like: query,
          },
        },
      ],
    })
  }

  const where: PayloadFindWhere = whereClauses.length > 1 ? { and: whereClauses } : whereClauses[0]

  const response = await payload.find({
    collection: 'locations',
    depth: 2,
    limit,
    page,
    sort: 'locationKey',
    where,
    overrideAccess: true,
    select: locationGridSelect,
  })

  const docs = (response.docs || [])
    .map((doc) => normalizeLocationGridCandidate(doc as LocationDocLike))
    .filter((candidate) => isLocationWithinScope(candidate, scope))

  return {
    docs,
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || Math.max(1, Math.ceil((response.totalDocs || 0) / limit)),
    page,
    limit,
  }
}
