import type { Payload } from 'payload'

import type { HomepageThingsToDoListiclesItemRef, SingleTypeListicleDocLike } from '../types'

import { findSingleTypeListicleDoc } from '../../reference-grid/listicle-grid'
import { THINGS_TO_DO_LISTICLES_GRID_CONFIG } from '../constants'

export async function findThingsToDoListicleDoc(
  payload: Payload,
  ref: HomepageThingsToDoListiclesItemRef,
): Promise<SingleTypeListicleDocLike> {
  return findSingleTypeListicleDoc(payload, ref, THINGS_TO_DO_LISTICLES_GRID_CONFIG)
}
