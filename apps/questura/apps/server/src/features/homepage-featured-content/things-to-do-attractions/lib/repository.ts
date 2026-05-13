import type { Payload } from 'payload'

import type { HomepageHotelCandidate, HomepageHotelItemRef } from '../../types'
import type { AttractionDocLike } from '../types'

import { normalizeAttractionCandidate } from './candidate'

export async function findAttractionDoc(
  payload: Payload,
  ref: HomepageHotelItemRef,
): Promise<HomepageHotelCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: 'attractions',
      id: ref.id,
      depth: 1,
      overrideAccess: true,
    })
    return normalizeAttractionCandidate(doc as AttractionDocLike)
  } catch {
    return null
  }
}
