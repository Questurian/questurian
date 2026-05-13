import type { HomepageTourCandidate } from './tour-grid.types'

export type HomepageTourCandidatesResponse = {
  docs: HomepageTourCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  allowDrafts: boolean
}

export type TourGridValidationOptions = {
  allowDrafts?: boolean
  slotCount?: number
}

export type TourGridSelectionOptions = {
  allowDrafts?: boolean
  totalSlots?: number
}

export type TourGridSearchOptions = {
  query?: string
  page?: number
  limit?: number
  allowDrafts?: boolean
}
