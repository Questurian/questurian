import type { Payload } from 'payload'

import type { HomepageWhereToEatDrinkItemRef, SingleTypeListicleDocLike } from '../types'

import { findSingleTypeListicleDoc } from '../../reference-grid/listicle-grid'
import { WHERE_TO_EAT_DRINK_GRID_CONFIG } from '../constants'

export async function findWhereToEatDrinkDoc(
  payload: Payload,
  ref: HomepageWhereToEatDrinkItemRef,
): Promise<SingleTypeListicleDocLike> {
  return findSingleTypeListicleDoc(payload, ref, WHERE_TO_EAT_DRINK_GRID_CONFIG)
}
