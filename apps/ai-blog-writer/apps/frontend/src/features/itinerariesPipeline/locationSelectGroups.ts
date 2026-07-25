import type { LocationOption } from '../listicleItineraries/types'
import {
  normalizeLocationKey,
  parseLocationKey
} from '../../shared/locationScope/keys'
import { formatLocationLabel } from '../../shared/locationScope/labels'
import { getLocationLevel } from '../../shared/locationScope/levels'

export type LocationSelectGroup = {
  key: string
  label: string
  options: { id: number; label: string }[]
}

function readableGeoToken(raw: string | null | undefined): string {
  const value = (raw || '').trim()
  if (!value) return ''
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function keysMatch(
  parentKey: string | null | undefined,
  childParentKey: string | null | undefined
): boolean {
  if (!childParentKey || !parentKey) return false
  return (
    normalizeLocationKey(parentKey) === normalizeLocationKey(childParentKey)
  )
}

export function locationRowIdsEqual(left: unknown, right: unknown): boolean {
  if (left == null || right == null) return false
  return String(left) === String(right)
}

export function buildLocationSelectGroups(
  locations: LocationOption[]
): LocationSelectGroup[] {
  const countries = locations.filter(
    (location) => (location.level ?? getLocationLevel(location)) === 'country'
  )
  const cities = locations.filter(
    (location) => (location.level ?? getLocationLevel(location)) === 'city'
  )
  const neighborhoods = locations.filter(
    (location) =>
      (location.level ?? getLocationLevel(location)) === 'neighborhood'
  )
  const sortedCountries = [...countries].sort((a, b) =>
    formatLocationLabel(a).localeCompare(formatLocationLabel(b), undefined, {
      sensitivity: 'base'
    })
  )
  const groups: LocationSelectGroup[] = []
  const assigned = new Set<number>()

  for (const country of sortedCountries) {
    const options = [{ id: country.id, label: formatLocationLabel(country) }]
    assigned.add(country.id)

    const citiesHere = cities
      .filter((city) => keysMatch(country.locationKey, city.parentKey))
      .sort((a, b) =>
        readableGeoToken(a.city).localeCompare(
          readableGeoToken(b.city),
          undefined,
          {
            sensitivity: 'base'
          }
        )
      )

    for (const city of citiesHere) {
      assigned.add(city.id)
      const keyParts = parseLocationKey(city.locationKey || '')
      const cityLabel =
        readableGeoToken(city.city) ||
        readableGeoToken(keyParts[keyParts.length - 1] ?? '')
      options.push({ id: city.id, label: cityLabel })

      const neighborhoodsHere = neighborhoods
        .filter((neighborhood) =>
          keysMatch(city.locationKey, neighborhood.parentKey)
        )
        .sort((a, b) =>
          readableGeoToken(a.neighborhood).localeCompare(
            readableGeoToken(b.neighborhood),
            undefined,
            { sensitivity: 'base' }
          )
        )

      for (const neighborhood of neighborhoodsHere) {
        assigned.add(neighborhood.id)
        const keyParts = parseLocationKey(neighborhood.locationKey || '')
        const label =
          readableGeoToken(neighborhood.neighborhood) ||
          readableGeoToken(keyParts[keyParts.length - 1] ?? '')
        options.push({
          id: neighborhood.id,
          label: `${cityLabel} › ${label}`
        })
      }
    }

    groups.push({
      key: country.locationKey || `country-${country.id}`,
      label: formatLocationLabel(country),
      options
    })
  }

  const orphans = locations.filter((location) => !assigned.has(location.id))
  if (orphans.length > 0) {
    groups.push({
      key: '__other__',
      label: 'Other locations',
      options: [...orphans]
        .sort((a, b) =>
          formatLocationLabel(a).localeCompare(
            formatLocationLabel(b),
            undefined,
            { sensitivity: 'base' }
          )
        )
        .map((location) => ({
          id: location.id,
          label: formatLocationLabel(location)
        }))
    })
  }

  return groups
}
