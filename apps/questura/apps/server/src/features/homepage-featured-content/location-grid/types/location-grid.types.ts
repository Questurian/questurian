import type { PublicImage } from '@/features/media/lib/resolve-public-image'

export type LocationGridLevel = 'city' | 'neighborhood'

export type LocationGridScope = {
  childLevel: LocationGridLevel
  parentKey?: string | null
}

export type LocationGridItemRef = {
  id: number
}

export type LocationGridCandidate = LocationGridItemRef & {
  slot?: number
  level: LocationGridLevel
  locationKey: string | null
  href: string | null
  parentKey: string | null
  countryName: string | null
  cityName: string | null
  neighborhoodName: string | null
  title: string
  subtitle: string | null
  updatedAt: string | null
  /**
   * @deprecated Read `coverImage.url` instead. Kept for back-compat.
   * Resolved from coverImage (media-set) when present.
   */
  coverImageUrl: string | null
  /** @deprecated Read `coverImage.alt` instead. Kept for back-compat. */
  coverImageAlt: string | null
  /** Resolved card-placement cover image. */
  coverImage: PublicImage | null
}

export type LocationGridInvalidReason = 'invalid_reference' | 'not_found' | 'invalid_scope'

export type LocationGridInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: LocationGridInvalidReason
}

export type LocationGridSelection = {
  items: LocationGridCandidate[]
  invalidItems: LocationGridInvalidItem[]
  isComplete: boolean
  totalSlots: number
}

export type LocationGridMediaAspect = 'rectangle' | 'square' | 'portrait'
