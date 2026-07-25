import type { LocationRef } from './locationHomepages'

export function getLocationLabel(location: LocationRef | null): string {
  if (!location) return 'Location Homepage'

  if (location.neighborhoodName) {
    return `${location.neighborhoodName}${location.cityName ? `, ${location.cityName}` : ''}`
  }

  if (location.cityName) return location.cityName

  return location.countryName ?? 'Location Homepage'
}
