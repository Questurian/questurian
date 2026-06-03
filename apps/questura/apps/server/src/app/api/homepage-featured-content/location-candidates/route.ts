import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import {
  MAIN_HOMEPAGE_LOCATION_GRID_SCOPE,
  searchLocationGridCandidates,
} from '@/features/homepage-featured-content'

const handler = createCandidateHandler({
  search: searchLocationGridCandidates,
  fallbackMessage: 'Failed to load location grid candidates.',
  extraParams: () => ({ scope: MAIN_HOMEPAGE_LOCATION_GRID_SCOPE }),
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
