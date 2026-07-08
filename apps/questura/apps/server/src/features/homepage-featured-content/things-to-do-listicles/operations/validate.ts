import type { Payload } from 'payload'

import type {
  HomepageThingsToDoListiclesItemRef,
  ThingsToDoListiclesValidationOptions,
} from '../types'

import { validateSingleTypeListicleGridItems } from '../../reference-grid/listicle-grid'
import { THINGS_TO_DO_LISTICLES_GRID_CONFIG } from '../constants'

export async function validateThingsToDoListiclesItems(
  payload: Payload,
  refs: HomepageThingsToDoListiclesItemRef[],
  options: ThingsToDoListiclesValidationOptions = {},
): Promise<HomepageThingsToDoListiclesItemRef[]> {
  return validateSingleTypeListicleGridItems(
    payload,
    refs,
    options,
    THINGS_TO_DO_LISTICLES_GRID_CONFIG,
  )
}
