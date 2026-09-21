import type { Payload } from 'payload'

import type { HomepageHotelCandidate, HomepageHotelItemRef } from '../../types'
import type { AttractionDocLike } from '../types'

import { ATTRACTION_ROOT_SELECT, HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import { readDocumentOnce } from '../../reference-grid/page-read-budget'
import { normalizeAttractionCandidate } from './candidate'
import { whenNotFound } from '@/shared/lib/not-found-error'

export async function findAttractionDoc(
  payload: Payload,
  ref: HomepageHotelItemRef,
): Promise<HomepageHotelCandidate | null> {
  // Deduped per request; the key names this repository's query shape.
  return readDocumentOnce(`attraction:${ref.id}`, async () => {
    try {
      const doc = await payload.findByID({
        collection: 'attractions',
        id: ref.id,
        depth: 2,
        overrideAccess: true,
        select: ATTRACTION_ROOT_SELECT,
        populate: HOMEPAGE_BLOCK_POPULATE,
      })
      return normalizeAttractionCandidate(doc as AttractionDocLike)
    } catch (error) {
      // Deleted is omitted; failed is an error (shared/lib/not-found-error.ts).
      return whenNotFound(error, null)
    }
  })
}
