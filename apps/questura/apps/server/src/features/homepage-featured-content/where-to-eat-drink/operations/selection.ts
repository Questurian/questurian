import type { Payload } from 'payload'

import type { HomepageWhereToEatDrinkSelection, WhereToEatDrinkSelectionOptions } from '../types'

import { getSingleTypeListicleGridSelectionFromItems } from '../../reference-grid/listicle-grid'
import { WHERE_TO_EAT_DRINK_GRID_CONFIG } from '../constants'

export async function getWhereToEatDrinkSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: WhereToEatDrinkSelectionOptions = {},
): Promise<HomepageWhereToEatDrinkSelection> {
  return getSingleTypeListicleGridSelectionFromItems(
    payload,
    rawItems,
    options,
    WHERE_TO_EAT_DRINK_GRID_CONFIG,
  )
}
