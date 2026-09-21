import type { Payload } from 'payload'

import type { LocationDocLike, LocationGridCandidate, LocationGridItemRef } from '../types'

import { locationGridSelect } from '../constants'
import { HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import { readDocumentOnce } from '../../reference-grid/page-read-budget'
import { normalizeLocationGridCandidate } from './candidate'

export async function findLocationGridDoc(
  payload: Payload,
  ref: LocationGridItemRef,
): Promise<LocationGridCandidate | null> {
  // Deduped per request; the key names this repository's query shape.
  return readDocumentOnce(`location-grid:${ref.id}`, async () => {
    try {
      const doc = await payload.findByID({
        collection: 'locations',
        id: ref.id,
        depth: 2,
        overrideAccess: true,
        select: locationGridSelect,
        populate: HOMEPAGE_BLOCK_POPULATE,
      })

      return normalizeLocationGridCandidate(doc as LocationDocLike)
    } catch {
      return null
    }
  })
}
