import type { LocationIndexRow } from '../../locationDocuments/types'

const LOCATION_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

export type ModalCityGroup = {
  key: string
  cityLabel: string
  city: LocationIndexRow | null
  neighborhoods: LocationIndexRow[]
}

export type ModalCountryGroup = {
  key: string
  countryLabel: string
  cityGroups: ModalCityGroup[]
}

export function getLocationDisplayLabel(loc: LocationIndexRow): string {
  if (loc.level === 'neighborhood' && loc.neighborhoodName) {
    return loc.cityName
      ? `${loc.neighborhoodName}, ${loc.cityName}`
      : loc.neighborhoodName
  }
  return loc.cityName ?? loc.countryName ?? loc.locationKey ?? String(loc.id)
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function getCountryLabel(loc: LocationIndexRow): string {
  const keyParts = loc.locationKey?.split('|') ?? []
  return (
    firstNonEmpty(loc.countryName, loc.country, keyParts[0]) ||
    'Unassigned country'
  )
}

function getCityLabel(loc: LocationIndexRow): string {
  const keyParts = loc.locationKey?.split('|') ?? []
  return (
    firstNonEmpty(loc.cityName, loc.city, keyParts[1]) || 'Unassigned city'
  )
}

function getLocationSearchText(loc: LocationIndexRow): string {
  return [
    getLocationDisplayLabel(loc),
    loc.countryName,
    loc.cityName,
    loc.neighborhoodName,
    loc.locationKey,
    loc.level,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase()
}

export function groupLocationOptions(
  cities: LocationIndexRow[],
  neighborhoods: LocationIndexRow[],
  existingLocationIds: number[],
  searchValue: string,
): ModalCountryGroup[] {
  const existingSet = new Set(existingLocationIds)
  const query = searchValue.trim().toLowerCase()
  const countryMap = new Map<
    string,
    ModalCountryGroup & { cityMap: Map<string, ModalCityGroup> }
  >()

  const insertLocation = (location: LocationIndexRow) => {
    const countryLabel = getCountryLabel(location)
    const cityLabel = getCityLabel(location)
    const countryKey = countryLabel.toLowerCase()
    const cityKey = `${countryKey}::${cityLabel.toLowerCase()}`

    let countryGroup = countryMap.get(countryKey)
    if (!countryGroup) {
      countryGroup = {
        key: countryKey,
        countryLabel,
        cityGroups: [],
        cityMap: new Map<string, ModalCityGroup>(),
      }
      countryMap.set(countryKey, countryGroup)
    }

    let cityGroup = countryGroup.cityMap.get(cityKey)
    if (!cityGroup) {
      cityGroup = {
        key: cityKey,
        cityLabel,
        city: null,
        neighborhoods: [],
      }
      countryGroup.cityMap.set(cityKey, cityGroup)
      countryGroup.cityGroups.push(cityGroup)
    }

    if (location.level === 'city') cityGroup.city = location
    else cityGroup.neighborhoods.push(location)
  }

  for (const city of cities) {
    if (!existingSet.has(city.id)) insertLocation(city)
  }
  for (const neighborhood of neighborhoods) {
    if (!existingSet.has(neighborhood.id)) insertLocation(neighborhood)
  }

  return Array.from(countryMap.values())
    .map((countryGroup) => filterCountryGroup(countryGroup, query))
    .filter((group): group is ModalCountryGroup => group !== null)
    .sort((left, right) =>
      LOCATION_COLLATOR.compare(left.countryLabel, right.countryLabel),
    )
}

function filterCountryGroup(
  countryGroup: ModalCountryGroup,
  query: string,
): ModalCountryGroup | null {
  const cityGroups = countryGroup.cityGroups
    .map((cityGroup) => filterCityGroup(countryGroup, cityGroup, query))
    .filter((group): group is ModalCityGroup => group !== null)
    .sort((left, right) =>
      LOCATION_COLLATOR.compare(left.cityLabel, right.cityLabel),
    )

  return cityGroups.length > 0
    ? {
        key: countryGroup.key,
        countryLabel: countryGroup.countryLabel,
        cityGroups,
      }
    : null
}

function filterCityGroup(
  countryGroup: ModalCountryGroup,
  cityGroup: ModalCityGroup,
  query: string,
): ModalCityGroup | null {
  const cityMatches =
    query.length === 0 ||
    [
      countryGroup.countryLabel,
      cityGroup.cityLabel,
      cityGroup.city?.locationKey,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' ')
      .toLowerCase()
      .includes(query)
  const matchingNeighborhoods =
    query.length === 0 || cityMatches
      ? cityGroup.neighborhoods
      : cityGroup.neighborhoods.filter((location) =>
          getLocationSearchText(location).includes(query),
        )

  if (!cityMatches && matchingNeighborhoods.length === 0) return null
  return {
    ...cityGroup,
    neighborhoods: [...matchingNeighborhoods].sort((left, right) =>
      LOCATION_COLLATOR.compare(
        getLocationDisplayLabel(left),
        getLocationDisplayLabel(right),
      ),
    ),
  }
}

export function countGroupedLocations(groups: ModalCountryGroup[]): number {
  return groups.reduce(
    (total, countryGroup) =>
      total +
      countryGroup.cityGroups.reduce(
        (cityTotal, cityGroup) =>
          cityTotal +
          (cityGroup.city ? 1 : 0) +
          cityGroup.neighborhoods.length,
        0,
      ),
    0,
  )
}
