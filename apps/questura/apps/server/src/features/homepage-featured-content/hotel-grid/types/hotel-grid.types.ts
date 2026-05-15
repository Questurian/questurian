import type { PublicImage } from '@/features/media/lib/resolve-public-image'

export type HomepageHotelItemRef = {
  id: number
}

export type HomepageHotelCandidate = HomepageHotelItemRef & {
  slot?: number
  title: string
  slug: string | null
  type: string | null
  priceLevel: string | null
  status: string | null
  updatedAt: string | null
  /** @deprecated Read `image.url` instead. Kept for back-compat. */
  imageUrl: string | null
  /** Resolved card-placement image with url, alt, dimensions, variant, status. */
  image: PublicImage | null
  location: string | null
}

export type HomepageHotelInvalidReason = 'invalid_reference' | 'not_found' | 'not_published'

export type HomepageHotelInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: HomepageHotelInvalidReason
}

export type HomepageHotelSelection = {
  items: HomepageHotelCandidate[]
  invalidItems: HomepageHotelInvalidItem[]
  isComplete: boolean
  allowDrafts: boolean
  totalSlots: number
}
