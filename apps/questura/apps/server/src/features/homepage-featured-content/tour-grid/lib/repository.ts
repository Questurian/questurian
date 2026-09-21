import type { Payload } from 'payload'

import type { HomepageTourCandidate, HomepageTourItemRef, TourDocLike } from '../types'

import { HOMEPAGE_BLOCK_POPULATE, TOUR_ROOT_SELECT } from '../../populate'
import { readDocumentOnce } from '../../reference-grid/page-read-budget'
import { normalizeTourCandidate } from './candidate'

export async function findTourDoc(
  payload: Payload,
  ref: HomepageTourItemRef,
): Promise<HomepageTourCandidate | null> {
  // Deduped per request; the key names this repository's query shape.
  return readDocumentOnce(`tour:${ref.id}`, async () => {
    try {
      const doc = await payload.findByID({
        collection: 'tours',
        id: ref.id,
        depth: 2,
        overrideAccess: true,
        select: TOUR_ROOT_SELECT,
        populate: HOMEPAGE_BLOCK_POPULATE,
      })
      return normalizeTourCandidate(doc as TourDocLike)
    } catch {
      return null
    }
  })
}
