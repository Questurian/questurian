import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchWhereToEatDrinkCandidates } from '@/features/homepage-featured-content'

// [id] is accepted for route symmetry; eat & drink search is collection-agnostic.
const handler = createCandidateHandler({
  search: searchWhereToEatDrinkCandidates,
  fallbackMessage: 'Failed to load Where to Eat & Drink candidates.',
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
