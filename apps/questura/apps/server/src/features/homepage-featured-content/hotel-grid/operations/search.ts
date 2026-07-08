import type { Payload } from 'payload'

import { getLocationScope } from '@/shared/location/server/locationScope'

import type {
  AccommodationDocLike,
  HomepageHotelCandidatesResponse,
  HotelGridSearchOptions,
  PayloadFindWhere,
} from '../types'

import { normalizeHotelCandidate, sortHotels } from '../lib/candidate'
import {
  combinePayloadWhereClauses,
  normalizeReferenceGridSearchOptions,
} from '../../reference-grid/numeric-grid'

export async function searchHotelGridCandidates(
  payload: Payload,
  options: HotelGridSearchOptions = {},
): Promise<HomepageHotelCandidatesResponse> {
  const { query, allowDrafts, page, limit } = normalizeReferenceGridSearchOptions(options)

  const whereClauses: PayloadFindWhere[] = []
  if (query) {
    whereClauses.push({
      or: [{ title: { like: query } }, { slug: { like: query } }],
    })
  }
  if (!allowDrafts) {
    whereClauses.push({ status: { equals: 'published' } })
  }

  const scopedKey = options.locationKey?.trim()
  if (scopedKey) {
    const scope = await getLocationScope(payload, scopedKey)
    const scopeOr: PayloadFindWhere[] = []
    if (scope.keys.length > 0) {
      scopeOr.push({ location: { in: scope.keys } })
    }
    if (scope.refs.length > 0) {
      scopeOr.push({ locationRef: { in: scope.refs } })
    }
    if (scopeOr.length === 0) {
      return {
        docs: [],
        totalDocs: 0,
        totalPages: 1,
        page,
        limit,
        allowDrafts,
      }
    }
    whereClauses.push(scopeOr.length === 1 ? scopeOr[0]! : { or: scopeOr })
  }

  const response = await payload.find({
    collection: 'accommodations',
    depth: 2,
    limit,
    page,
    sort: '-updatedAt',
    where: combinePayloadWhereClauses(whereClauses),
    overrideAccess: true,
  })

  const docs = (response.docs || [])
    .map((doc) => normalizeHotelCandidate(doc as AccommodationDocLike))
    .sort(sortHotels)
  return {
    docs,
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || 1,
    page: response.page || page,
    limit: response.limit || limit,
    allowDrafts,
  }
}
