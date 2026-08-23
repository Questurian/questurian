import type { LocationHomepageListItem, LocationRef } from './locationHomepages'
import type {
  CountryHomepageGroup,
  CityHomepageGroup
} from './locationHomepageList.types'

const LOCATION_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base'
})

export function formatHomepageDate(value: string | null): string {
  if (!value) return '—'
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function getLocationHomepageLabel(
  item: LocationHomepageListItem
): string {
  const loc = item.location
  if (!loc) return `Homepage #${item.id}`

  if (loc.neighborhoodName) {
    return loc.cityName
      ? `${loc.neighborhoodName}, ${loc.cityName}`
      : loc.neighborhoodName
  }

  return loc.cityName ?? loc.countryName ?? `Homepage #${item.id}`
}

export function getLocationHomepagePrimaryLabel(
  item: LocationHomepageListItem
): string {
  const loc = item.location
  if (!loc) return `Homepage #${item.id}`

  if (loc.level === 'neighborhood') {
    return loc.neighborhoodName?.trim() || getLocationHomepageLabel(item)
  }

  if (loc.level === 'city') {
    return loc.cityName?.trim() || getLocationHomepageLabel(item)
  }

  return getLocationHomepageLabel(item)
}

function normalizeGroupValue(
  ...values: Array<string | null | undefined>
): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function getCountryLabel(location: LocationRef | null): string {
  if (!location) return 'Unassigned country'
  const keyParts = location.locationKey?.split('|') ?? []
  return (
    normalizeGroupValue(location.countryName, keyParts[0]) ||
    'Unassigned country'
  )
}

function getCityLabel(location: LocationRef | null): string {
  if (!location) return 'Unassigned city'
  const keyParts = location.locationKey?.split('|') ?? []
  return (
    normalizeGroupValue(location.cityName, keyParts[1]) || 'Unassigned city'
  )
}

function toGroupKey(label: string, fallback: string): string {
  const normalized = label.trim().toLowerCase()
  return normalized || fallback
}

export function getLocationHomepageSearchText(
  item: LocationHomepageListItem
): string {
  const location = item.location

  return [
    getLocationHomepageLabel(item),
    getLocationHomepagePrimaryLabel(item),
    location?.countryName,
    location?.cityName,
    location?.neighborhoodName,
    location?.locationKey,
    location?.level
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase()
}

function compareItems(
  left: LocationHomepageListItem,
  right: LocationHomepageListItem
): number {
  if (left.isEnabled !== right.isEnabled) {
    return left.isEnabled ? -1 : 1
  }

  const labelComparison = LOCATION_COLLATOR.compare(
    getLocationHomepagePrimaryLabel(left),
    getLocationHomepagePrimaryLabel(right)
  )
  if (labelComparison !== 0) return labelComparison

  return left.id - right.id
}

export function buildHomepageGroups(
  items: LocationHomepageListItem[]
): CountryHomepageGroup[] {
  const countryMap = new Map<
    string,
    CountryHomepageGroup & { cityMap: Map<string, CityHomepageGroup> }
  >()

  for (const item of items) {
    const countryLabel = getCountryLabel(item.location)
    const cityLabel = getCityLabel(item.location)
    const countryKey = toGroupKey(countryLabel, `country:${item.id}`)
    const cityKey = `${countryKey}::${toGroupKey(cityLabel, `city:${item.id}`)}`

    let countryGroup = countryMap.get(countryKey)
    if (!countryGroup) {
      countryGroup = {
        key: countryKey,
        countryLabel,
        cityGroups: [],
        cityMap: new Map<string, CityHomepageGroup>()
      }
      countryMap.set(countryKey, countryGroup)
    }

    let cityGroup = countryGroup.cityMap.get(cityKey)
    if (!cityGroup) {
      cityGroup = {
        key: cityKey,
        cityLabel,
        cityHomepage: null,
        neighborhoodHomepages: []
      }
      countryGroup.cityMap.set(cityKey, cityGroup)
      countryGroup.cityGroups.push(cityGroup)
    }

    if (item.location?.level === 'city') {
      cityGroup.cityHomepage = item
      continue
    }

    cityGroup.neighborhoodHomepages.push(item)
  }

  return Array.from(countryMap.values())
    .map((countryGroup) => ({
      key: countryGroup.key,
      countryLabel: countryGroup.countryLabel,
      cityGroups: countryGroup.cityGroups
        .map((cityGroup) => ({
          ...cityGroup,
          neighborhoodHomepages: [...cityGroup.neighborhoodHomepages].sort(
            compareItems
          )
        }))
        .sort((left, right) =>
          LOCATION_COLLATOR.compare(left.cityLabel, right.cityLabel)
        )
    }))
    .sort((left, right) =>
      LOCATION_COLLATOR.compare(left.countryLabel, right.countryLabel)
    )
}

export function filterHomepageGroups(
  homepageGroups: CountryHomepageGroup[],
  searchValue: string
): CountryHomepageGroup[] {
  const normalizedQuery = searchValue.trim().toLowerCase()
  if (!normalizedQuery) return homepageGroups

  return homepageGroups
    .map((countryGroup) => {
      const countryMatches = countryGroup.countryLabel
        .toLowerCase()
        .includes(normalizedQuery)
      const cityGroups = countryGroup.cityGroups.flatMap((cityGroup) => {
        const citySearchText = [
          cityGroup.cityLabel,
          cityGroup.cityHomepage?.location?.locationKey,
          countryGroup.countryLabel
        ]
          .filter((value): value is string => Boolean(value?.trim()))
          .join(' ')
          .toLowerCase()

        if (countryMatches || citySearchText.includes(normalizedQuery)) {
          return [cityGroup]
        }

        const matchingNeighborhoods = cityGroup.neighborhoodHomepages.filter(
          (item) =>
            getLocationHomepageSearchText(item).includes(normalizedQuery)
        )

        if (matchingNeighborhoods.length === 0) {
          return []
        }

        return [
          {
            ...cityGroup,
            neighborhoodHomepages: matchingNeighborhoods
          }
        ]
      })

      if (cityGroups.length === 0) return []

      return [
        {
          ...countryGroup,
          cityGroups
        }
      ]
    })
    .flat()
}
