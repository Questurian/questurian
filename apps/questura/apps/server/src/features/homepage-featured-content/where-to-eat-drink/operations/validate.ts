import type { Payload } from 'payload'

import type { HomepageWhereToEatDrinkItemRef, WhereToEatDrinkValidationOptions } from '../types'

import { validateSingleTypeListicleGridItems } from '../../reference-grid/listicle-grid'
import { WHERE_TO_EAT_DRINK_GRID_CONFIG } from '../constants'

export async function validateWhereToEatDrinkItems(
  payload: Payload,
  refs: HomepageWhereToEatDrinkItemRef[],
  options: WhereToEatDrinkValidationOptions = {},
): Promise<HomepageWhereToEatDrinkItemRef[]> {
  return validateSingleTypeListicleGridItems(payload, refs, options, WHERE_TO_EAT_DRINK_GRID_CONFIG)
}
