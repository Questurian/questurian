import type { HomepageHotelItemRef } from '../../types'

export type { PayloadFindWhere } from '@/shared/utils/payload-types'

export type AttractionDocLike = {
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
  attractionsDetails?: unknown
}

export type ParsedAttractionSlot = {
  slot: number
  ref: HomepageHotelItemRef | null
  reason: 'invalid_reference' | null
}
