import { createCandidateHandler } from '@/features/homepage-featured-content/candidate-route'
import { searchHomepageFeaturedCandidates } from '@/features/homepage-featured-content'

const handler = createCandidateHandler({
  search: searchHomepageFeaturedCandidates,
  fallbackMessage: 'Failed to load homepage featured candidates.',
  extraParams: (searchParams) => ({ type: searchParams.get('type') }),
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
