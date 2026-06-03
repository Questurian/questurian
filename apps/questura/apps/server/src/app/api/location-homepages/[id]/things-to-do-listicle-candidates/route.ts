import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchThingsToDoListicleCandidates } from '@/features/homepage-featured-content'

// [id] is accepted for route symmetry; listicle search is collection-agnostic.
const handler = createCandidateHandler({
  search: searchThingsToDoListicleCandidates,
  fallbackMessage: 'Failed to load Things to Do listicle candidates.',
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
