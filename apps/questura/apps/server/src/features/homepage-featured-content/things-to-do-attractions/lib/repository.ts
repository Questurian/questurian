import type { Payload } from 'payload'

import type { HomepageHotelCandidate, HomepageHotelItemRef } from '../../types'
import type { AttractionDocLike } from '../types'

import { ATTRACTION_ROOT_SELECT, HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import { normalizeAttractionCandidate } from './candidate'

export async function findAttractionDoc(
  payload: Payload,
  ref: HomepageHotelItemRef,
): Promise<HomepageHotelCandidate | null> {
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
  } catch {
    return null
  }
}
