import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'
import { getLocationScope } from '@/shared/location/server/locationScope'

import type {
  AccommodationDocLike,
  HomepageHotelCandidatesResponse,
  HotelGridSearchOptions,
  PayloadFindWhere,
} from '../types'

import { normalizeHotelCandidate, sortHotels } from '../lib/candidate'

export async function searchHotelGridCandidates(
  payload: Payload,
  options: HotelGridSearchOptions = {},
): Promise<HomepageHotelCandidatesResponse> {
  const query = options.query?.trim() || ''
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const page =
    Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit =
    Number.isFinite(options.limit) && (options.limit || 0) > 0
      ? Math.min(Math.trunc(options.limit!), 50)
      : 24

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

  const where: PayloadFindWhere | undefined =
    whereClauses.length > 1 ? { and: whereClauses } : whereClauses[0]
  const response = await payload.find({
    collection: 'accommodations',
    depth: 2,
    limit,
    page,
    sort: '-updatedAt',
    where,
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
