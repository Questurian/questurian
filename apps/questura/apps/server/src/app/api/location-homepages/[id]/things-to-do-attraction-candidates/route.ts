import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchThingsToDoAttractionCandidates } from '@/features/homepage-featured-content'

// [id] is accepted for route symmetry; attraction search is collection-agnostic.
const handler = createCandidateHandler({
  search: searchThingsToDoAttractionCandidates,
  fallbackMessage: 'Failed to load Things to Do attraction candidates.',
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
