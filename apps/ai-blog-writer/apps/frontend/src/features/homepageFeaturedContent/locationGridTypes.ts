import type { LocationLevel } from '../locationDocuments/types'

export const LOCATION_GRID_MEDIA_ASPECTS = ['rectangle', 'square', 'portrait'] as const

export type LocationGridMediaAspect = (typeof LOCATION_GRID_MEDIA_ASPECTS)[number]

export type HomepageLocationGridLevel = Extract<LocationLevel, 'city' | 'neighborhood'>

export type HomepageLocationGridItemRef = {
  id: number
}

export type HomepageLocationGridCandidate = HomepageLocationGridItemRef & {
  slot?: number
  level: HomepageLocationGridLevel
  locationKey: string | null
  parentKey: string | null
  countryName: string | null
  cityName: string | null
  neighborhoodName: string | null
  title: string
  subtitle: string | null
  updatedAt: string | null
  /** From the top-level Location coverImage media-set relationship, when set in Payload */
  coverImageUrl: string | null
  coverImageAlt: string | null
}

export type HomepageLocationGridInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: 'invalid_reference' | 'not_found' | 'invalid_scope'
}

export type HomepageLocationGridSelection = {
  items: HomepageLocationGridCandidate[]
  invalidItems: HomepageLocationGridInvalidItem[]
  isComplete: boolean
  totalSlots: number
}

export type HomepageLocationGridCandidatesResponse = {
  docs: HomepageLocationGridCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
}
