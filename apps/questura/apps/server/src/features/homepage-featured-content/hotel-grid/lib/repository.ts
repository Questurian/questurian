import type { Payload } from 'payload'

import type { AccommodationDocLike, HomepageHotelCandidate, HomepageHotelItemRef } from '../types'

import { ACCOMMODATION_ROOT_SELECT, HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import { readDocumentOnce } from '../../reference-grid/page-read-budget'
import { normalizeHotelCandidate } from './candidate'
import { whenNotFound } from '@/shared/lib/not-found-error'

export async function findHotelDoc(
  payload: Payload,
  ref: HomepageHotelItemRef,
): Promise<HomepageHotelCandidate | null> {
  // Deduped per request; the key names this repository's query shape.
  return readDocumentOnce(`hotel:${ref.id}`, async () => {
    try {
      const doc = await payload.findByID({
        collection: 'accommodations',
        id: ref.id,
        depth: 2,
        overrideAccess: true,
        select: ACCOMMODATION_ROOT_SELECT,
        populate: HOMEPAGE_BLOCK_POPULATE,
      })
      return normalizeHotelCandidate(doc as AccommodationDocLike)
    } catch (error) {
      // Deleted is omitted; failed is an error (shared/lib/not-found-error.ts).
      return whenNotFound(error, null)
    }
  })
}
