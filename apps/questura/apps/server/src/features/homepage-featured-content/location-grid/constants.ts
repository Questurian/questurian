import { locationIdentitySelect } from '@/shared/location/constants'

export const LOCATION_GRID_MIN_SLOTS = 4
export const LOCATION_GRID_MAX_SLOTS = 8

/** Select identity + cover image relationship (populated at depth ≥ 2). */
export const locationGridSelect = {
  ...locationIdentitySelect,
  updatedAt: true,
  coverImage: true,
} as const
