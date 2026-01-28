/**
 * Location utility functions for parsing and filtering
 */

import { LocationOption, LocationPickerValue } from '../types'

/**
 * Parse pipe-delimited location string into separate components
 * @param value - Pipe-delimited string (e.g., "colombia|bogota|santa-teresita") or any value
 * @returns Object with country, city, neighborhood properties (or null if invalid input)
 * @example parseLocationValue("colombia|bogota") → { country: "colombia", city: "bogota", neighborhood: null }
 */
export const parseLocationValue = (value: unknown): LocationPickerValue | null => {
  if (typeof value !== 'string' || !value) return null

  const [country, city, neighborhood] = value.split('|')
  return {
    country: country || null,
    city: city || null,
    neighborhood: neighborhood || null,
  }
}

/**
 * Format a single location name: replace hyphens with spaces and title-case
 * @param name - Location name to format
 * @returns Formatted name with spaces and title casing
 * @example formatLocationName("santa-teresita") → "Santa Teresita"
 */
export const formatLocationName = (name: string): string => {
  if (!name) return ''

  // Replace hyphens with spaces
  const withSpaces = name.replace(/-/g, ' ')
  // Capitalize first letter of each word
  return withSpaces
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const buildDisplayParts = (location: LocationOption): string[] => {
  const parts: string[] = []

  const countryLabel =
    location.countryName || (location.country ? formatLocationName(location.country) : '')
  const cityLabel = location.cityName || (location.city ? formatLocationName(location.city) : '')
  const neighborhoodLabel =
    location.neighborhoodName ||
    (location.neighborhood ? formatLocationName(location.neighborhood) : '')

  if (countryLabel) parts.push(countryLabel)
  if (cityLabel) parts.push(cityLabel)
  if (neighborhoodLabel) parts.push(neighborhoodLabel)

  return parts
}

/**
 * Format pipe-delimited location string to readable display text
 * @param value - Pipe-delimited location string
 * @param locations - Optional location records for display names
 * @returns Formatted string with title case and " > " separators
 * @example formatLocationForDisplay("colombia|bogota|santa-teresita") → "Colombia > Bogota > Santa Teresita"
 */
export const formatLocationForDisplay = (
  value: string,
  locations?: LocationOption[]
): string => {
  if (!value) return ''

  if (locations?.length) {
    const match = locations.find((loc) => loc.locationKey === value)
    if (match) {
      const parts = buildDisplayParts(match)
      if (parts.length > 0) return parts.join(' > ')
    }
  }

  // Split by pipe delimiter
  const parts = value.split('|')

  // Transform each part using the formatLocationName helper
  const formattedParts = parts.map(formatLocationName)

  return formattedParts.join(' > ')
}

/**
 * Filter location array to get cities for a specific country
 * @param locations - Full array of all location records
 * @param countryId - ID of the selected country
 * @returns Array of city LocationOption records for that country
 * @example filterCitiesByCountry(allLocations, "5") → [{ id: 42, country: "colombia", city: "bogota", neighborhood: null }, ...]
 */
export const filterCitiesByCountry = (
  locations: LocationOption[],
  countryId: string
): LocationOption[] => {
  const countryLocation = locations.find((loc) => loc.id === parseInt(countryId))
  if (!countryLocation || !countryLocation.country) return []

  return locations.filter(
    (loc) =>
      loc.country === countryLocation.country &&
      loc.city &&
      !loc.neighborhood
  )
}

/**
 * Filter location array to get neighborhoods for a specific city
 * @param locations - Full array of all location records
 * @param countryId - ID of the selected country
 * @param cityId - ID of the selected city
 * @returns Array of neighborhood LocationOption records for that city
 * @example filterNeighborhoodsByCity(allLocations, "5", "42") → [{ id: 123, country: "colombia", city: "bogota", neighborhood: "santa-teresita" }, ...]
 */
export const filterNeighborhoodsByCity = (
  locations: LocationOption[],
  countryId: string,
  cityId: string
): LocationOption[] => {
  const countryLocation = locations.find((loc) => loc.id === parseInt(countryId))
  const cityLocation = locations.find((loc) => loc.id === parseInt(cityId))

  if (!countryLocation || !cityLocation) return []

  return locations.filter(
    (loc) =>
      loc.country === countryLocation.country &&
      loc.city === cityLocation.city &&
      loc.neighborhood
  )
}
