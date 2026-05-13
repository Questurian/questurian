import type { HomepageTourInvalidReason, HomepageTourItemRef } from './tour-grid.types'

export type { PayloadFindWhere } from '../../payload.types'

export type TourDocLike = {
  id?: unknown
  title?: unknown
  bookingLink?: unknown
  price?: unknown
  status?: unknown
  updatedAt?: unknown
  locationRef?: unknown
  img?: unknown
}

export type ParsedTourSlot = {
  slot: number
  ref: HomepageTourItemRef | null
  reason: HomepageTourInvalidReason | null
}
