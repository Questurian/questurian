import type { HomepageHotelItemRef } from './hotel-grid.types'

export type { PayloadFindWhere } from '@/shared/utils/payload-types'

export type AccommodationDocLike = {
  id?: unknown
  title?: unknown
  slug?: unknown
  type?: unknown
  priceLevel?: unknown
  status?: unknown
  updatedAt?: unknown
  location?: unknown
  locationRef?: unknown
  gallery?: unknown
  core?: unknown
  theStay?: unknown
  theExperience?: unknown
  theDetails?: unknown
}

export type ParsedHotelSlot = {
  slot: number
  ref: HomepageHotelItemRef | null
  reason: 'invalid_reference' | null
}
