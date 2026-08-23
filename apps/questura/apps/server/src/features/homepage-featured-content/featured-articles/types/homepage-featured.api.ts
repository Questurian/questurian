import type { HomepageFeaturedCandidate } from './homepage-featured.types'

export type HomepageFeaturedCandidatesResponse = {
  docs: HomepageFeaturedCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  allowDrafts: boolean
}

export type HomepageFeaturedValidationOptions = {
  allowDrafts?: boolean
  slotCount?: number
}

export type HomepageFeaturedSelectionOptions = {
  allowDrafts?: boolean
  totalSlots?: number
}

export type HomepageFeaturedSearchOptions = {
  query?: string
  type?: string | null
  page?: number
  limit?: number
  allowDrafts?: boolean
  authorIds?: number[]
}

export type HomepageFeaturedPlaceholderOptions = {
  allowDrafts?: boolean
}
