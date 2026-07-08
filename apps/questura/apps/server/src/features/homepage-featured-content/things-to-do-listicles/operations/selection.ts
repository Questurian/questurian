import type { Payload } from 'payload'

import type {
  HomepageThingsToDoListiclesSelection,
  ThingsToDoListiclesSelectionOptions,
} from '../types'

import { getSingleTypeListicleGridSelectionFromItems } from '../../reference-grid/listicle-grid'
import { THINGS_TO_DO_LISTICLES_GRID_CONFIG } from '../constants'

export async function getThingsToDoListiclesSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: ThingsToDoListiclesSelectionOptions = {},
): Promise<HomepageThingsToDoListiclesSelection> {
  return getSingleTypeListicleGridSelectionFromItems(
    payload,
    rawItems,
    options,
    THINGS_TO_DO_LISTICLES_GRID_CONFIG,
  )
}
