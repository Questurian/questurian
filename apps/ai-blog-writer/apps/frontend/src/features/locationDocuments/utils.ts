import type {
  LocationIndexRow,
  LocationLevel,
  LocationOption,
  MediaSetOption,
  MediaSetVariantAsset,
} from './types'

const LOCATION_ROW_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
const LOCATION_LEVEL_ORDER: Record<LocationLevel, number> = {
  country: 0,
  city: 1,
  neighborhood: 2,
}

export type LocationIndexCityGroup = {
  cityKey: string
  cityLabel: string
  cityRow: LocationIndexRow | null
  rows: LocationIndexRow[]
  neighborhoodRows: LocationIndexRow[]
}

export type LocationIndexCountryGroup = {
  countryKey: string
  countryLabel: string
  countryRow: LocationIndexRow | null
  rows: LocationIndexRow[]
  cityGroups: LocationIndexCityGroup[]
  cityCount: number
  neighborhoodCount: number
}

export function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function titleCaseFromKey(value: string): string {
  return value
    .split(/[-_\s|]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function summarizeLocationIndexRow(
  row: Pick<LocationIndexRow, 'level' | 'countryName' | 'cityName' | 'neighborhoodName' | 'locationKey'>,
): string {
  if (row.level === 'country') return row.countryName || titleCaseFromKey(row.locationKey)
  if (row.level === 'city') return row.cityName || titleCaseFromKey(row.locationKey.split('|').pop() || row.locationKey)
  return row.neighborhoodName || titleCaseFromKey(row.locationKey.split('|').pop() || row.locationKey)
}

function normalizeLocationSortValue(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function normalizeLocationGroupKey(...values: Array<string | null | undefined>): string {
  return normalizeLocationSortValue(...values).toLowerCase()
}

function resolveCountryLabel(row: LocationIndexRow): string {
  return normalizeLocationSortValue(
    row.countryName,
    row.country,
    row.locationKey.split('|')[0],
  ) || titleCaseFromKey(row.locationKey.split('|')[0] || row.locationKey)
}

function resolveCityLabel(row: LocationIndexRow): string {
  return normalizeLocationSortValue(
    row.cityName,
    row.city,
    row.locationKey.split('|')[1],
  ) || 'Unassigned city'
}

export function sortLocationIndexRows(rows: LocationIndexRow[]): LocationIndexRow[] {
  return [...rows].sort((left, right) => {
    const countryComparison = LOCATION_ROW_COLLATOR.compare(
      normalizeLocationSortValue(left.countryName, left.country),
      normalizeLocationSortValue(right.countryName, right.country),
    )
    if (countryComparison !== 0) return countryComparison

    const cityComparison = LOCATION_ROW_COLLATOR.compare(
      normalizeLocationSortValue(left.cityName, left.city),
      normalizeLocationSortValue(right.cityName, right.city),
    )
    if (cityComparison !== 0) return cityComparison

    const neighborhoodComparison = LOCATION_ROW_COLLATOR.compare(
      normalizeLocationSortValue(left.neighborhoodName, left.neighborhood),
      normalizeLocationSortValue(right.neighborhoodName, right.neighborhood),
    )
    if (neighborhoodComparison !== 0) return neighborhoodComparison

    const levelComparison = LOCATION_LEVEL_ORDER[left.level] - LOCATION_LEVEL_ORDER[right.level]
    if (levelComparison !== 0) return levelComparison

    const locationKeyComparison = LOCATION_ROW_COLLATOR.compare(left.locationKey, right.locationKey)
    if (locationKeyComparison !== 0) return locationKeyComparison

    return LOCATION_ROW_COLLATOR.compare(left.updatedAt || '', right.updatedAt || '')
  })
}

export function groupLocationIndexRowsByCountry(rows: LocationIndexRow[]): LocationIndexCountryGroup[] {
  const sortedRows = sortLocationIndexRows(rows)
  const countryGroups: LocationIndexCountryGroup[] = []
  const countryGroupMap = new Map<string, LocationIndexCountryGroup>()
  const cityGroupMaps = new Map<string, Map<string, LocationIndexCityGroup>>()

  for (const row of sortedRows) {
    const countryKey = normalizeLocationGroupKey(
      row.country,
      row.countryName,
      row.locationKey.split('|')[0],
      row.locationKey,
    ) || row.locationKey.toLowerCase()

    let countryGroup = countryGroupMap.get(countryKey)
    if (!countryGroup) {
      countryGroup = {
        countryKey,
        countryLabel: resolveCountryLabel(row),
        countryRow: null,
        rows: [],
        cityGroups: [],
        cityCount: 0,
        neighborhoodCount: 0,
      }
      countryGroupMap.set(countryKey, countryGroup)
      cityGroupMaps.set(countryKey, new Map<string, LocationIndexCityGroup>())
      countryGroups.push(countryGroup)
    }

    countryGroup.rows.push(row)

    if (row.level === 'country') {
      countryGroup.countryRow = row
      continue
    }

    if (row.level === 'city') {
      countryGroup.cityCount += 1
    } else if (row.level === 'neighborhood') {
      countryGroup.neighborhoodCount += 1
    }

    const cityKey = normalizeLocationGroupKey(
      row.city,
      row.cityName,
      row.locationKey.split('|')[1],
      row.locationKey,
    ) || row.locationKey.toLowerCase()

    const cityMap = cityGroupMaps.get(countryKey)
    if (!cityMap) continue

    let cityGroup = cityMap.get(cityKey)
    if (!cityGroup) {
      cityGroup = {
        cityKey,
        cityLabel: resolveCityLabel(row),
        cityRow: null,
        rows: [],
        neighborhoodRows: [],
      }
      cityMap.set(cityKey, cityGroup)
      countryGroup.cityGroups.push(cityGroup)
    }

    cityGroup.rows.push(row)

    if (row.level === 'city') {
      cityGroup.cityRow = row
      continue
    }

    cityGroup.neighborhoodRows.push(row)
  }

  return countryGroups
}

export function formatLocationLabel(
  location: Pick<LocationOption, 'level' | 'countryName' | 'cityName' | 'neighborhoodName' | 'locationKey'>,
): string {
  const primary = summarizeLocationIndexRow({
    level: location.level,
    countryName: location.countryName,
    cityName: location.cityName,
    neighborhoodName: location.neighborhoodName,
    locationKey: location.locationKey,
  })

  if (location.level === 'country') return primary

  const context = location.level === 'city'
    ? [location.countryName]
    : [location.cityName, location.countryName]

  const prettyContext = context.filter((value): value is string => Boolean(value?.trim()))
  return prettyContext.length > 0 ? `${primary} / ${prettyContext.join(' / ')}` : primary
}

export function formatMediaSetLabel(
  option: Pick<MediaSetOption, 'title' | 'location' | 'alt_text'>,
): string {
  const parts = [option.title, option.location, option.alt_text].filter(
    (value): value is string => Boolean(value?.trim()),
  )
  return parts.join(' · ') || 'Untitled media set'
}

const PREFERRED_MEDIA_SET_VARIANTS = ['thumbnail', 'square', 'editorial', 'wide', 'portrait', 'hero', 'open_graph'] as const
const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

export function resolveMediaSetPreviewAsset(
  option: Pick<MediaSetOption, 'variants'> | null | undefined,
): MediaSetVariantAsset | null {
  if (!option?.variants) return null

  for (const key of PREFERRED_MEDIA_SET_VARIANTS) {
    const variant = option.variants[key]
    if (variant && typeof variant === 'object') {
      return variant as MediaSetVariantAsset
    }
  }

  return null
}

export function resolveMediaSetPreviewUrl(
  option: Pick<MediaSetOption, 'variants'> | null | undefined,
): string | undefined {
  const previewAsset = resolveMediaSetPreviewAsset(option)
  if (!previewAsset) return undefined
  if (previewAsset.url) return previewAsset.url
  if (previewAsset.filename) return `${PAYLOAD_API_URL}/api/media-assets/file/${previewAsset.filename}`
  return undefined
}
