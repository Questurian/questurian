import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { HOMEPAGE_FEATURED_CONTENT_COLLECTIONS } from '../types'
import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedSearchOptions,
  PayloadDocLike,
  PayloadFindWhere,
} from '../types'

import {
  normalizeHomepageFeaturedCandidate,
  sortHomepageFeaturedCandidates,
} from '../lib/candidate'
import { isHomepageFeaturedCollection } from '../lib/refs'
import { homepageFeaturedSelect } from '../lib/repository'

export async function searchHomepageFeaturedCandidates(
  payload: Payload,
  options: HomepageFeaturedSearchOptions = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  const query = options.query?.trim() || ''
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const page =
    Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit =
    Number.isFinite(options.limit) && (options.limit || 0) > 0
      ? Math.min(Math.trunc(options.limit!), 50)
      : 24
  const effectiveCollections = isHomepageFeaturedCollection(options.type)
    ? [options.type]
    : [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS]
  const perCollectionLimit = page * limit

  const results = await Promise.all(
    effectiveCollections.map(async (collection) => {
      const whereClauses: PayloadFindWhere[] = []

      if (query) {
        whereClauses.push({
          or: [
            {
              title: {
                like: query,
              },
            },
            {
              slug: {
                like: query,
              },
            },
          ],
        })
      }

      if (!allowDrafts) {
        whereClauses.push({
          status: {
            equals: 'published',
          },
        })
      }

      const where: PayloadFindWhere | undefined =
        whereClauses.length > 1 ? { and: whereClauses } : whereClauses[0]

      const response = await payload.find({
        collection,
        depth: 3,
        limit: perCollectionLimit,
        page: 1,
        sort: '-updatedAt',
        where,
        overrideAccess: true,
        select: homepageFeaturedSelect,
      })

      return {
        collection,
        docs: (response.docs || []).map((doc) =>
          normalizeHomepageFeaturedCandidate(collection, doc as PayloadDocLike),
        ),
        totalDocs: response.totalDocs || 0,
      }
    }),
  )

  const allDocs = results
    .flatMap((result) => result.docs)
    .sort(sortHomepageFeaturedCandidates)
  const totalDocs = results.reduce((sum, result) => sum + result.totalDocs, 0)
  const start = (page - 1) * limit
  const docs = allDocs.slice(start, start + limit)

  return {
    docs,
    totalDocs,
    totalPages: Math.max(1, Math.ceil(totalDocs / limit)),
    page,
    limit,
    allowDrafts,
  }
}
