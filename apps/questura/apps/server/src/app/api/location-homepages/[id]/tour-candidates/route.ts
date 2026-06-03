import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchTourGridCandidates } from '@/features/homepage-featured-content'

// [id] is accepted for route symmetry; tour search is collection-agnostic.
const handler = createCandidateHandler({
  search: searchTourGridCandidates,
  fallbackMessage: 'Failed to load tour candidates.',
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
