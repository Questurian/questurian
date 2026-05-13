import type { HomepageHotelInvalidReason, HomepageHotelItemRef } from './hotel-grid.types'

export type { PayloadFindWhere } from '../../payload.types'

export type AccommodationDocLike = {
  id?: unknown
  title?: unknown
  slug?: unknown
  type?: unknown
  priceLevel?: unknown
  status?: unknown
  updatedAt?: unknown
  location?: unknown
  gallery?: unknown
}

export type ParsedHotelSlot = {
  slot: number
  ref: HomepageHotelItemRef | null
  reason: HomepageHotelInvalidReason | null
}
