import type { HomepageThingsToDoListiclesItemRef } from '../types'

import {
  buildSingleTypeListicleGridData,
  normalizeSingleTypeListicleGridInput,
} from '../../reference-grid/listicle-grid'
import { THINGS_TO_DO_LISTICLES_GRID_CONFIG } from '../constants'

export function normalizeThingsToDoListiclesInput(
  rawItems: unknown,
): HomepageThingsToDoListiclesItemRef[] {
  return normalizeSingleTypeListicleGridInput(rawItems, THINGS_TO_DO_LISTICLES_GRID_CONFIG)
}

export function buildThingsToDoListiclesGlobalData(items: HomepageThingsToDoListiclesItemRef[]) {
  return buildSingleTypeListicleGridData(items)
}
