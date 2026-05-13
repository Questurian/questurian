import type { Payload } from 'payload'

import type { HomepageWhereToEatDrinkItemRef, SingleTypeListicleDocLike } from '../types'

import { WHERE_TO_EAT_DRINK_COLLECTION } from '../constants'

export async function findWhereToEatDrinkDoc(
  payload: Payload,
  ref: HomepageWhereToEatDrinkItemRef,
): Promise<SingleTypeListicleDocLike> {
  return (await payload.findByID({
    collection: WHERE_TO_EAT_DRINK_COLLECTION,
    id: ref.id,
    depth: 0,
    overrideAccess: true,
  })) as SingleTypeListicleDocLike
}
