import type { Payload } from 'payload'

import type { HomepageHotelCandidatesResponse } from '../../types'
import type {
  AttractionDocLike,
  PayloadFindWhere,
  ThingsToDoAttractionsSearchOptions,
} from '../types'

import { normalizeAttractionCandidate, sortAttractions } from '../lib/candidate'
import {
  combinePayloadWhereClauses,
  normalizeReferenceGridSearchOptions,
} from '../../reference-grid/numeric-grid'

export async function searchThingsToDoAttractionCandidates(
  payload: Payload,
  options: ThingsToDoAttractionsSearchOptions = {},
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

  const response = await payload.find({
    collection: 'attractions',
    depth: 1,
    limit,
    page,
    sort: '-updatedAt',
    where: combinePayloadWhereClauses(whereClauses),
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
