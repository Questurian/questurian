import type { Location } from '../../../api'

const isLocationId = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

export function normalizeSharedNeighborhoods(value: unknown): number[] {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(value.filter(isLocationId))
  )
}

export function getSharedNeighborhoodOptions(
  locations: Location[],
  primaryLocationId?: number
): Location[] {
  const primaryLocation = locations.find((candidate) => candidate.id === primaryLocationId)
  if (!primaryLocation || primaryLocation.level !== 'city') return []

  return locations.filter((candidate) => (
    candidate.level === 'neighborhood'
    && candidate.parentKey === primaryLocation.locationKey
  ))
}

export function sanitizeSharedNeighborhoods(
  sharedNeighborhoods: number[],
  locations: Location[],
  primaryLocationId?: number
): number[] {
  if (sharedNeighborhoods.length === 0) return []

  const allowedIds = new Set(
    getSharedNeighborhoodOptions(locations, primaryLocationId).map((location) => location.id)
  )

  return Array.from(
    new Set(sharedNeighborhoods.filter((locationId) => allowedIds.has(locationId)))
  )
}

export function buildPrimaryLocationUpdate(input: {
  locations: Location[]
  nextLocationId?: number
  sharedNeighborhoods: number[]
}): {
  locationId?: number
  sharedNeighborhoods: number[]
} {
  return {
    locationId: input.nextLocationId,
    sharedNeighborhoods: sanitizeSharedNeighborhoods(
      input.sharedNeighborhoods,
      input.locations,
      input.nextLocationId
    ),
  }
}
