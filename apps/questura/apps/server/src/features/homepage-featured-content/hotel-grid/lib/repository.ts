import type { Payload } from 'payload'

import type { AccommodationDocLike, HomepageHotelCandidate, HomepageHotelItemRef } from '../types'

import { normalizeHotelCandidate } from './candidate'

export async function findHotelDoc(
  payload: Payload,
  ref: HomepageHotelItemRef,
): Promise<HomepageHotelCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: 'accommodations',
      id: ref.id,
      depth: 2,
      overrideAccess: true,
    })
    return normalizeHotelCandidate(doc as AccommodationDocLike)
  } catch {
    return null
  }
}
