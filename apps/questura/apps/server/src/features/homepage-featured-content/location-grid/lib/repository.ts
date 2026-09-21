import type { Payload } from 'payload'

import type { LocationDocLike, LocationGridCandidate, LocationGridItemRef } from '../types'

import { locationGridSelect } from '../constants'
import { HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import { readDocumentOnce } from '../../reference-grid/page-read-budget'
import { normalizeLocationGridCandidate } from './candidate'
import { whenNotFound } from '@/shared/lib/not-found-error'

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
    } catch (error) {
      // Deleted is omitted; failed is an error (shared/lib/not-found-error.ts).
      return whenNotFound(error, null)
    }
  })
}
