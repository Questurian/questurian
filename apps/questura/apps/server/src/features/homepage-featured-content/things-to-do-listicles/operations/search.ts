import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { getHomepageFeaturedSelectionFromItems } from '../../featured-articles/service'
import type {
  HomepageThingsToDoListiclesCandidatesResponse,
  PayloadFindWhere,
  ThingsToDoListiclesSearchOptions,
} from '../types'

import {
  THINGS_TO_DO_LISTICLES_COLLECTION,
  THINGS_TO_DO_LISTICLES_LISTICLE_TYPE,
} from '../constants'

export async function searchThingsToDoListicleCandidates(
  payload: Payload,
  options: ThingsToDoListiclesSearchOptions = {},
): Promise<HomepageThingsToDoListiclesCandidatesResponse> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const query = options.query?.trim() || ''
  const page =
    Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit =
    Number.isFinite(options.limit) && (options.limit || 0) > 0
      ? Math.min(Math.trunc(options.limit!), 50)
      : 24

  const whereClauses: PayloadFindWhere[] = [
    { listicleType: { equals: THINGS_TO_DO_LISTICLES_LISTICLE_TYPE } },
  ]
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
    collection: THINGS_TO_DO_LISTICLES_COLLECTION,
    depth: 1,
    page,
    limit,
    sort: '-updatedAt',
    where,
    overrideAccess: true,
  })

  const selection = await getHomepageFeaturedSelectionFromItems(
    payload,
    (response.docs || []).map((doc) => ({
      relationTo: THINGS_TO_DO_LISTICLES_COLLECTION,
      id: typeof doc.id === 'number' ? doc.id : Number(doc.id),
    })),
    { allowDrafts, totalSlots: response.docs.length },
  )

  return {
    docs: selection.items.map((item) => ({ ...item, slot: undefined })),
    totalDocs: response.totalDocs || 0,
    totalPages: response.totalPages || 1,
    page: response.page || page,
    limit: response.limit || limit,
    allowDrafts,
  }
}
