import type { HomepageWhereToEatDrinkItemRef } from '../types'

import {
  buildSingleTypeListicleGridData,
  normalizeSingleTypeListicleGridInput,
} from '../../reference-grid/listicle-grid'
import { WHERE_TO_EAT_DRINK_GRID_CONFIG } from '../constants'

export function normalizeWhereToEatDrinkInput(rawItems: unknown): HomepageWhereToEatDrinkItemRef[] {
  return normalizeSingleTypeListicleGridInput(rawItems, WHERE_TO_EAT_DRINK_GRID_CONFIG)
}

export function buildWhereToEatDrinkGlobalData(items: HomepageWhereToEatDrinkItemRef[]) {
  return buildSingleTypeListicleGridData(items)
}
