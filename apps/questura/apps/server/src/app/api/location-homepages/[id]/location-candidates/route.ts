import {
  createLocationCandidateHandler,
  withLocationGridScope,
} from '@/features/homepage-featured-content/candidate-route'
import { searchLocationGridCandidates } from '@/features/homepage-featured-content'

const handler = createLocationCandidateHandler({
  search: searchLocationGridCandidates,
  fallbackMessage: 'Failed to load location grid candidates.',
  resolveContext: withLocationGridScope,
})

export const GET = handler.GET
export const OPTIONS = handler.OPTIONS
