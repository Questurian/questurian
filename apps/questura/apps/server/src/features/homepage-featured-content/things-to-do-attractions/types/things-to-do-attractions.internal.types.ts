import type { HomepageHotelInvalidReason, HomepageHotelItemRef } from '../../types'

export type { PayloadFindWhere } from '../../payload.types'

export type AttractionDocLike = {
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

export type ParsedAttractionSlot = {
  slot: number
  ref: HomepageHotelItemRef | null
  reason: HomepageHotelInvalidReason | null
}
