import type { HomepageHotelCandidate } from './hotel-grid.types'

export type HomepageHotelCandidatesResponse = {
  docs: HomepageHotelCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  allowDrafts: boolean
}

export type HotelGridValidationOptions = {
  allowDrafts?: boolean
  slotCount?: number
}

export type HotelGridSelectionOptions = {
  allowDrafts?: boolean
  totalSlots?: number
}

export type HotelGridSearchOptions = {
  query?: string
  page?: number
  limit?: number
  allowDrafts?: boolean
  /** When set, only accommodations in this location scope (see getLocationScope). */
  locationKey?: string
}
