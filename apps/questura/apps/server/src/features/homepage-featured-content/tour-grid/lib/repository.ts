import type { Payload } from 'payload'

import type { HomepageTourCandidate, HomepageTourItemRef, TourDocLike } from '../types'

import { normalizeTourCandidate } from './candidate'

export async function findTourDoc(
  payload: Payload,
  ref: HomepageTourItemRef,
): Promise<HomepageTourCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: 'tours',
      id: ref.id,
      depth: 2,
      overrideAccess: true,
    })
    return normalizeTourCandidate(doc as TourDocLike)
  } catch {
    return null
  }
}
