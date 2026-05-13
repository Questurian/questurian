import type { LocationGridInvalidReason, LocationGridItemRef } from './location-grid.types'

export type { PayloadFindWhere } from '../../payload.types'

export type LocationDocLike = {
  id?: unknown
  level?: unknown
  locationKey?: unknown
  parentKey?: unknown
  countryName?: unknown
  cityName?: unknown
  neighborhoodName?: unknown
  updatedAt?: unknown
  guide?: unknown
}

export type ParsedLocationGridSlot = {
  slot: number
  ref: LocationGridItemRef | null
  reason: LocationGridInvalidReason | null
}
