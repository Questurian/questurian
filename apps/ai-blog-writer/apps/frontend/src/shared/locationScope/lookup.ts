import type { LocationDoc } from './types'
import { normalizeLocationKey, parseLocationKey } from './keys'
import { formatLocationLabel } from './labels'
import { getLocationLevel, isCityLocation } from './levels'

export const findLocationByKey = <T extends Pick<LocationDoc, 'locationKey'>>(
  locations: T[],
  locationKey: string,
): T | null => {
  const normalizedLocationKey = normalizeLocationKey(locationKey)
  if (!normalizedLocationKey) return null

  return locations.find((location) => (
    normalizeLocationKey(location.locationKey || '') === normalizedLocationKey
  )) || null
}

export function getNeighborhoodOptionsForLocation<T extends LocationDoc>(
  locations: T[],
  locationKey: string,
): T[] {
  const selectedLocation = findLocationByKey(locations, locationKey)
  const parentKey = normalizeLocationKey(selectedLocation?.locationKey || '')

  if (!selectedLocation || !isCityLocation(selectedLocation) || !parentKey) {
    return []
  }

  return locations
    .filter((location) => (
      getLocationLevel(location) === 'neighborhood'
      && normalizeLocationKey(
        location.parentKey
        || parseLocationKey(location.locationKey || '').slice(0, 2).join('|'),
      ) === parentKey
    ))
    .sort((left, right) => formatLocationLabel(left).localeCompare(formatLocationLabel(right)))
}
