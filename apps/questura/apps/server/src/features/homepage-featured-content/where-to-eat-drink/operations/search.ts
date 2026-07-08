import type { Payload } from 'payload'

import type {
  HomepageWhereToEatDrinkCandidatesResponse,
  WhereToEatDrinkSearchOptions,
} from '../types'

import { searchSingleTypeListicleGridCandidates } from '../../reference-grid/listicle-grid'
import { WHERE_TO_EAT_DRINK_GRID_CONFIG } from '../constants'

export async function searchWhereToEatDrinkCandidates(
  payload: Payload,
  options: WhereToEatDrinkSearchOptions = {},
): Promise<HomepageWhereToEatDrinkCandidatesResponse> {
  return searchSingleTypeListicleGridCandidates(payload, options, WHERE_TO_EAT_DRINK_GRID_CONFIG)
}
