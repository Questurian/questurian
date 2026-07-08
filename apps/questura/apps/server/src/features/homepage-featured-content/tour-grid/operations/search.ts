import type { Payload } from 'payload'

import type {
  HomepageTourCandidatesResponse,
  PayloadFindWhere,
  TourDocLike,
  TourGridSearchOptions,
} from '../types'

import { normalizeTourCandidate, sortTours } from '../lib/candidate'
import {
  combinePayloadWhereClauses,
  normalizeReferenceGridSearchOptions,
} from '../../reference-grid/numeric-grid'

export async function searchTourGridCandidates(
  payload: Payload,
  options: TourGridSearchOptions = {},
): Promise<HomepageTourCandidatesResponse> {
  const { query, allowDrafts, page, limit } = normalizeReferenceGridSearchOptions(options)

  const whereClauses: PayloadFindWhere[] = []
  if (query) {
    whereClauses.push({ title: { like: query } })
  }
  if (!allowDrafts) {
    whereClauses.push({ status: { equals: 'published' } })
  }

  const response = await payload.find({
    collection: 'tours',
    depth: 2,
    limit,
    page,
    sort: '-updatedAt',
    where: combinePayloadWhereClauses(whereClauses),
    overrideAccess: true,
  })

  const docs = (response.docs || [])
    .map((doc) => normalizeTourCandidate(doc as TourDocLike))
    .sort(sortTours)
  return {
    docs,
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || 1,
    page: response.page || page,
    limit: response.limit || limit,
    allowDrafts,
  }
}
