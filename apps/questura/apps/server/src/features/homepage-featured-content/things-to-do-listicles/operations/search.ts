import type { Payload } from 'payload'

import type {
  HomepageThingsToDoListiclesCandidatesResponse,
  ThingsToDoListiclesSearchOptions,
} from '../types'

import { searchSingleTypeListicleGridCandidates } from '../../reference-grid/listicle-grid'
import { THINGS_TO_DO_LISTICLES_GRID_CONFIG } from '../constants'

export async function searchThingsToDoListicleCandidates(
  payload: Payload,
  options: ThingsToDoListiclesSearchOptions = {},
): Promise<HomepageThingsToDoListiclesCandidatesResponse> {
  return searchSingleTypeListicleGridCandidates(
    payload,
    options,
    THINGS_TO_DO_LISTICLES_GRID_CONFIG,
  )
}
