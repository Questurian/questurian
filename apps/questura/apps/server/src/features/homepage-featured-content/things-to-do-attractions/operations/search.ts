import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import type { HomepageHotelCandidatesResponse } from '../../types'
import type {
  AttractionDocLike,
  PayloadFindWhere,
  ThingsToDoAttractionsSearchOptions,
} from '../types'

import { normalizeAttractionCandidate, sortAttractions } from '../lib/candidate'

export async function searchThingsToDoAttractionCandidates(
  payload: Payload,
  options: ThingsToDoAttractionsSearchOptions = {},
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

  const where: PayloadFindWhere | undefined =
    whereClauses.length > 1 ? { and: whereClauses } : whereClauses[0]
  const response = await payload.find({
    collection: 'attractions',
    depth: 1,
    limit,
    page,
    sort: '-updatedAt',
    where,
    overrideAccess: true,
  })

  const docs = (response.docs || [])
    .map((doc) => normalizeAttractionCandidate(doc as AttractionDocLike))
    .sort(sortAttractions)
  return {
    docs,
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || 1,
    page: response.page || page,
    limit: response.limit || limit,
    allowDrafts,
  }
}
