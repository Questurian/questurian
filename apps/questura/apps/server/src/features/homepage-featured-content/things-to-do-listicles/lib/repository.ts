import type { Payload } from 'payload'

import type {
  HomepageThingsToDoListiclesItemRef,
  SingleTypeListicleDocLike,
} from '../types'

import { THINGS_TO_DO_LISTICLES_COLLECTION } from '../constants'

export async function findThingsToDoListicleDoc(
  payload: Payload,
  ref: HomepageThingsToDoListiclesItemRef,
): Promise<SingleTypeListicleDocLike> {
  return (await payload.findByID({
    collection: THINGS_TO_DO_LISTICLES_COLLECTION,
    id: ref.id,
    depth: 0,
    overrideAccess: true,
  })) as SingleTypeListicleDocLike
}
