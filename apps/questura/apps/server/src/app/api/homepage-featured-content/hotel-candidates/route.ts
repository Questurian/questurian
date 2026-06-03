import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchHotelGridCandidates } from '@/features/homepage-featured-content'

const handler = createCandidateHandler({
  search: searchHotelGridCandidates,
  fallbackMessage: 'Failed to load hotel candidates.',
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
