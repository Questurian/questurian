import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchWhereToEatDrinkCandidates } from '@/features/homepage-featured-content'

const handler = createCandidateHandler({
  search: searchWhereToEatDrinkCandidates,
  fallbackMessage: 'Failed to load Where to Eat & Drink candidates.',
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
