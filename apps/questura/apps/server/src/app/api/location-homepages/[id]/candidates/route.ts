import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchHomepageFeaturedCandidates } from '@/features/homepage-featured-content'

// GET /api/location-homepages/[id]/candidates
// The [id] param is accepted for route symmetry but the candidate search is collection-agnostic.
const handler = createCandidateHandler({
  search: searchHomepageFeaturedCandidates,
  fallbackMessage: 'Failed to load homepage featured candidates.',
  extraParams: (searchParams) => ({ type: searchParams.get('type') }),
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
