import {
  createLocationCandidateHandler,
  withLocationKey,
} from '@/features/homepage-featured-content/candidate-route'
import { searchHotelGridCandidates } from '@/features/homepage-featured-content'

const handler = createLocationCandidateHandler({
  search: searchHotelGridCandidates,
  fallbackMessage: 'Failed to load hotel candidates.',
  resolveContext: withLocationKey,
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
