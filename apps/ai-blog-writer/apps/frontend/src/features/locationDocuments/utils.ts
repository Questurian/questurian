import type {
  LocationDocumentDraft,
  LocationFieldDefinition,
  LocationIndexRow,
  LocationLevel,
  LocationOption,
  MediaSetOption,
  MediaSetVariantAsset,
  ScalarFieldDefinition,
} from './types'

type PathSegment = string | number
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

function normalizePath(path: string | Array<string | number>): PathSegment[] {
  if (Array.isArray(path)) {
    return path.map((segment) => {
      if (typeof segment === 'number') return segment
      return /^\d+$/.test(segment) ? Number(segment) : segment
    })
  }

  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment))
}

export function getValueAtPath<T>(value: T, path: string | Array<string | number>): unknown {
  return normalizePath(path).reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined
    if (typeof segment === 'number' && Array.isArray(current)) {
      return current[segment]
    }
    if (typeof segment === 'string' && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, value)
}

export function setValueAtPath<T extends object>(
  value: T,
  path: string | Array<string | number>,
  nextValue: unknown,
): T {
  const result = cloneValue(value)
  const segments = normalizePath(path)

  if (!segments.length) return result

  let current: unknown = result
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    const nextSegment = segments[index + 1]

    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        throw new Error(`Path ${path} does not resolve to an array`)
      }
      if (current[segment] === undefined) {
        current[segment] = typeof nextSegment === 'number' ? [] : {}
      }
      current = current[segment]
      continue
    }

    if (typeof current !== 'object' || current === null) {
      throw new Error(`Path ${path} does not resolve to an object`)
    }

    const record = current as Record<string, unknown>
    if (record[segment] === undefined || record[segment] === null) {
      record[segment] = typeof nextSegment === 'number' ? [] : {}
    }
    current = record[segment]
  }

  const finalSegment = segments[segments.length - 1]
  if (typeof finalSegment === 'number') {
    if (!Array.isArray(current)) {
      throw new Error(`Path ${path} does not resolve to an array`)
    }
    current[finalSegment] = nextValue
    return result
  }

  if (typeof current !== 'object' || current === null) {
    throw new Error(`Path ${path} does not resolve to an object`)
  }

  ;(current as Record<string, unknown>)[finalSegment] = nextValue
  return result
}

export function formatPath(path: Array<string | number>): string {
  return path.map((segment) => String(segment)).join('.')
}

export function isLocalLevel(level: LocationLevel): boolean {
  return level === 'city' || level === 'neighborhood'
}

function titleCaseFromKey(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function summarizeLocationIndexRow(row: Pick<LocationIndexRow, 'level' | 'countryName' | 'cityName' | 'neighborhoodName' | 'locationKey'>): string {
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

function normalizeLocationToken(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
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
    if (!cityMap) {
      continue
    }

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

export function formatLocationLabel(location: Pick<LocationOption, 'level' | 'countryName' | 'cityName' | 'neighborhoodName' | 'locationKey'>): string {
  const primary = summarizeLocationIndexRow({
    level: location.level,
    countryName: location.countryName,
    cityName: location.cityName,
    neighborhoodName: location.neighborhoodName,
    locationKey: location.locationKey,
  })

  if (location.level === 'country') return primary

  const segments = [location.countryName, location.cityName, location.neighborhoodName].filter(
    (value): value is string => Boolean(value?.trim()),
  )

  if (segments.length > 1) {
    return `${primary} · ${segments.join(' / ')}`
  }

  return `${primary} · ${location.locationKey}`
}

export function clampRelationshipSelections(values: number[], maxSelections: number): number[] {
  const unique = [...new Set(values.filter((value) => Number.isFinite(value)))]
  return unique.slice(0, Math.max(0, maxSelections))
}

export function toggleLimitedRelationshipSelection(
  values: number[],
  optionId: number,
  maxSelections: number,
): number[] {
  const nextValues = [...new Set(values.filter((value) => Number.isFinite(value)))]

  if (nextValues.includes(optionId)) {
    return nextValues.filter((value) => value !== optionId)
  }

  if (nextValues.length >= maxSelections) {
    return nextValues
  }

  return [...nextValues, optionId]
}

export function getNeighborhoodPickerOptions(
  locations: LocationOption[],
  draft: Pick<LocationDocumentDraft, 'country' | 'city'>,
): {
  options: LocationOption[]
  isScopedToCity: boolean
} {
  const neighborhoods = locations.filter((item) => item.level === 'neighborhood')
  const countryKey = normalizeLocationToken(draft.country)
  const cityKey = normalizeLocationToken(draft.city)

  const sortOptions = (options: LocationOption[]) => [...options].sort((left, right) => {
    const neighborhoodComparison = LOCATION_ROW_COLLATOR.compare(
      normalizeLocationSortValue(left.neighborhoodName, left.neighborhood),
      normalizeLocationSortValue(right.neighborhoodName, right.neighborhood),
    )

    if (neighborhoodComparison !== 0) return neighborhoodComparison

    const cityComparison = LOCATION_ROW_COLLATOR.compare(
      normalizeLocationSortValue(left.cityName, left.city),
      normalizeLocationSortValue(right.cityName, right.city),
    )

    if (cityComparison !== 0) return cityComparison

    const countryComparison = LOCATION_ROW_COLLATOR.compare(
      normalizeLocationSortValue(left.countryName, left.country),
      normalizeLocationSortValue(right.countryName, right.country),
    )

    if (countryComparison !== 0) return countryComparison

    return LOCATION_ROW_COLLATOR.compare(left.locationKey, right.locationKey)
  })

  if (!countryKey || !cityKey) {
    return {
      options: sortOptions(neighborhoods),
      isScopedToCity: false,
    }
  }

  return {
    options: sortOptions(
      neighborhoods.filter((item) => (
        normalizeLocationToken(item.country) === countryKey
        && normalizeLocationToken(item.city) === cityKey
      )),
    ),
    isScopedToCity: true,
  }
}

export function formatMediaSetLabel(option: Pick<MediaSetOption, 'title' | 'location' | 'alt_text'>): string {
  const parts = [option.title, option.location, option.alt_text].filter((value): value is string => Boolean(value?.trim()))
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

function buildScalarDefault(field: ScalarFieldDefinition): string | number | null {
  if (field.type === 'number') return null
  return ''
}

export function createDefaultObjectFromFields(fields: LocationFieldDefinition[]): Record<string, unknown> {
  const next: Record<string, unknown> = {}

  for (const field of fields) {
    if (field.type === 'group') {
      next[field.key] = createDefaultObjectFromFields(field.fields)
      continue
    }

    if (field.type === 'array') {
      next[field.key] = []
      continue
    }

    if (field.type === 'relationship') {
      next[field.key] = field.hasMany ? [] : null
      if (field.hintKey) {
        next[field.hintKey] = field.hasMany ? [] : ''
      }
      continue
    }

    next[field.key] = buildScalarDefault(field)
  }

  return next
}

function diffValues(previous: unknown, next: unknown, basePath: string, changes: string[]) {
  if (previous === next) return

  if (Array.isArray(previous) || Array.isArray(next)) {
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changes.push(basePath)
    }
    return
  }

  if (
    previous
    && next
    && typeof previous === 'object'
    && typeof next === 'object'
  ) {
    const keys = new Set([...Object.keys(previous as Record<string, unknown>), ...Object.keys(next as Record<string, unknown>)])
    for (const key of keys) {
      diffValues(
        (previous as Record<string, unknown>)[key],
        (next as Record<string, unknown>)[key],
        basePath ? `${basePath}.${key}` : key,
        changes,
      )
    }
    return
  }

  changes.push(basePath)
}

export function diffChangedPaths<T>(previous: T, next: T): string[] {
  const changes: string[] = []
  diffValues(previous, next, '', changes)
  return changes.filter(Boolean)
}

export function mergeDefinedValues<T>(current: T, patch: Partial<T>): T {
  if (Array.isArray(current) && Array.isArray(patch)) {
    return cloneValue(patch) as T
  }

  if (
    current !== null
    && patch !== null
    && typeof current === 'object'
    && typeof patch === 'object'
    && !Array.isArray(current)
    && !Array.isArray(patch)
  ) {
    const result: Record<string, unknown> = { ...(current as Record<string, unknown>) }

    for (const [key, patchValue] of Object.entries(patch)) {
      if (patchValue === undefined) continue

      const currentValue = result[key]
      if (
        currentValue !== null
        && patchValue !== null
        && typeof currentValue === 'object'
        && typeof patchValue === 'object'
        && !Array.isArray(currentValue)
        && !Array.isArray(patchValue)
      ) {
        result[key] = mergeDefinedValues(
          currentValue as Record<string, unknown>,
          patchValue as Record<string, unknown>
        )
        continue
      }

      result[key] = cloneValue(patchValue)
    }

    return result as T
  }

  return cloneValue(patch as T)
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length < 1
  if (Array.isArray(value)) return value.length < 1
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length < 1
  return false
}

export function pruneEmptyValues<T>(value: T): T | undefined {
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => pruneEmptyValues(entry))
      .filter((entry) => !isEmptyValue(entry))
    return (next.length ? next : undefined) as T | undefined
  }

  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(value)) {
      const pruned = pruneEmptyValues(entry)
      if (isEmptyValue(pruned)) continue
      next[key] = pruned
    }

    return (Object.keys(next).length ? next : undefined) as T | undefined
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return (trimmed.length ? trimmed : undefined) as T | undefined
  }

  if (value === null || value === undefined) {
    return undefined
  }

  return value
}
