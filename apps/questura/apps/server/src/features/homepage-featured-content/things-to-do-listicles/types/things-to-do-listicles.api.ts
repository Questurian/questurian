import type { HomepageFeaturedCandidatesResponse } from '../../types'

export type HomepageThingsToDoListiclesCandidatesResponse = HomepageFeaturedCandidatesResponse

export type ThingsToDoListiclesValidationOptions = {
  allowDrafts?: boolean
  slotCount?: number
}

export type ThingsToDoListiclesSelectionOptions = {
  allowDrafts?: boolean
  totalSlots?: number
}

export type ThingsToDoListiclesSearchOptions = {
  query?: string
  page?: number
  limit?: number
  allowDrafts?: boolean
}
