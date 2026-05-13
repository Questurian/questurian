import type { HomepageFeaturedCandidatesResponse } from '../../types'

export type HomepageWhereToEatDrinkCandidatesResponse = HomepageFeaturedCandidatesResponse

export type WhereToEatDrinkValidationOptions = {
  allowDrafts?: boolean
  slotCount?: number
}

export type WhereToEatDrinkSelectionOptions = {
  allowDrafts?: boolean
  totalSlots?: number
}

export type WhereToEatDrinkSearchOptions = {
  query?: string
  page?: number
  limit?: number
  allowDrafts?: boolean
}
