import type { Payload } from 'payload'

import type { LocationDocLike, LocationGridCandidate, LocationGridItemRef } from '../types'

import { locationGridSelect } from '../constants'
import { normalizeLocationGridCandidate } from './candidate'

export async function findLocationGridDoc(
  payload: Payload,
  ref: LocationGridItemRef,
): Promise<LocationGridCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: 'locations',
      id: ref.id,
      depth: 2,
      overrideAccess: true,
      select: locationGridSelect,
    })

    return normalizeLocationGridCandidate(doc as LocationDocLike)
  } catch {
    return null
  }
}
