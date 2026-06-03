import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchTourGridCandidates } from '@/features/homepage-featured-content'

const handler = createCandidateHandler({
  search: searchTourGridCandidates,
  fallbackMessage: 'Failed to load tour candidates.',
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
