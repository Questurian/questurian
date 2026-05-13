import type { LocationDoc, LocationListResponse, LocationScope } from './types'

const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

const normalizeSegment = (segment: string): string => segment.trim().toLowerCase()

const getRelationshipId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

function formatLocationToken(token: string): string {
  return token
    .trim()
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export const normalizeLocationKey = (locationKey: string): string =>
  locationKey
    .trim()
    .toLowerCase()
    .split('|')
    .map(normalizeSegment)
    .filter(Boolean)
    .join('|')

export const parseLocationKey = (locationKey: string): string[] => {
  const normalized = normalizeLocationKey(locationKey)
  if (!normalized) return []
  return normalized.split('|')
}

export const normalizeLocationIds = (values: unknown): number[] => {
  if (!Array.isArray(values)) return []

  const seen = new Set<number>()
  const ids: number[] = []

  for (const value of values) {
    const id = getRelationshipId(value)
    if (id === null || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids
}

export const areLocationIdSelectionsEqual = (left: number[], right: number[]): boolean => {
  const normalizedLeft = [...normalizeLocationIds(left)].sort((a, b) => a - b)
  const normalizedRight = [...normalizeLocationIds(right)].sort((a, b) => a - b)

  if (normalizedLeft.length !== normalizedRight.length) return false

  for (let index = 0; index < normalizedLeft.length; index += 1) {
    if (normalizedLeft[index] !== normalizedRight[index]) return false
  }

  return true
}

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

export const getLocationLevel = (
  location: Pick<LocationDoc, 'locationKey' | 'level'> | null | undefined,
): LocationDoc['level'] => {
  if (location?.level) return location.level

  const parts = parseLocationKey(location?.locationKey || '')
  if (parts.length >= 3) return 'neighborhood'
  if (parts.length === 2) return 'city'
  if (parts.length === 1) return 'country'
  return undefined
}

export const isCityLocation = (location: Pick<LocationDoc, 'locationKey' | 'level'> | null | undefined): boolean =>
  getLocationLevel(location) === 'city'

export function formatLocationLabel(location: Pick<LocationDoc, 'locationKey' | 'country' | 'city' | 'neighborhood'>): string {
  const partsFromFields = [
    location.country,
    location.city || undefined,
    location.neighborhood || undefined,
  ]
    .map((part) => (part || '').trim())
    .filter(Boolean)

  if (partsFromFields.length > 0) {
    return partsFromFields.map((part) => formatLocationToken(part)).join(' > ')
  }

  const partsFromKey = parseLocationKey(location.locationKey || '')
  if (partsFromKey.length > 0) {
    return partsFromKey.map((part) => formatLocationToken(part)).join(' > ')
  }

  return location.locationKey || ''
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

export function buildExactNeighborhoodScope(
  sharedNeighborhoods: number[] | undefined,
  locations: Array<Pick<LocationDoc, 'id' | 'locationKey'>> = [],
): LocationScope | null {
  const refs = normalizeLocationIds(sharedNeighborhoods)
  if (refs.length < 1) return null

  const keySet = new Set<string>()
  for (const id of refs) {
    const location = locations.find((entry) => entry.id === id)
    const key = normalizeLocationKey(location?.locationKey || '')
    if (key) keySet.add(key)
  }

  return {
    keys: Array.from(keySet),
    refs,
  }
}

export const getEffectiveScopeParts = (locationKey: string): string[] => {
  const parts = parseLocationKey(locationKey)

  if (parts.length >= 3) {
    return parts.slice(0, 2)
  }

  return parts
}

export const isLocationWithinScope = (itemLocationKey: string, selectedLocationKey: string): boolean => {
  const itemParts = parseLocationKey(itemLocationKey)
  const selectedParts = getEffectiveScopeParts(selectedLocationKey)

  if (!itemParts.length || !selectedParts.length) return false
  if (selectedParts.length > itemParts.length) return false

  for (let i = 0; i < selectedParts.length; i += 1) {
    if (itemParts[i] !== selectedParts[i]) {
      return false
    }
  }

  return true
}

function buildScopeWhere(parts: string[]): URLSearchParams {
  const params = new URLSearchParams()

  if (parts.length === 1) {
    params.set('where[country][equals]', parts[0])
  } else if (parts.length === 2) {
    params.set('where[and][0][country][equals]', parts[0])
    params.set('where[and][1][city][equals]', parts[1])
  }

  return params
}

async function payloadRequest<T>(endpoint: string, token: string): Promise<T> {
  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Payload request failed' }))
    throw new Error(err.message || err.errors?.[0]?.message || `Payload request failed: ${response.status}`)
  }

  return response.json()
}

export async function getLocationScopeForKey(locationKey: string, token: string): Promise<LocationScope> {
  const normalized = normalizeLocationKey(locationKey)
  const parts = getEffectiveScopeParts(normalized)
  const effectiveLocation = parts.join('|')

  if (!effectiveLocation) {
    return {
      keys: [],
      refs: [],
    }
  }

  if (parts.length > 2 || parts.length === 0) {
    return {
      keys: [effectiveLocation],
      refs: [],
    }
  }

  const keySet = new Set<string>()
  const refSet = new Set<number>()
  const whereParams = buildScopeWhere(parts)

  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams(whereParams)
    params.set('limit', '200')
    params.set('page', String(page))
    params.set('depth', '0')

    const response = await payloadRequest<LocationListResponse>(`/api/locations?${params.toString()}`, token)

    for (const doc of response.docs || []) {
      const normalizedLocationKey = normalizeLocationKey(doc.locationKey || '')
      if (normalizedLocationKey) keySet.add(normalizedLocationKey)
      if (typeof doc.id === 'number') refSet.add(doc.id)
    }

    totalPages = response.totalPages || 1
    page += 1
  }

  if (!keySet.size && effectiveLocation) {
    keySet.add(effectiveLocation)
  }

  return {
    keys: Array.from(keySet),
    refs: Array.from(refSet),
  }
}

export function appendScopedLocationWhere(params: URLSearchParams, scope: LocationScope): void {
  const hasKeys = scope.keys.length > 0
  const hasRefs = scope.refs.length > 0

  if (hasKeys && hasRefs) {
    params.set('where[or][0][location][in]', scope.keys.join(','))
    params.set('where[or][1][locationRef][in]', scope.refs.join(','))
    return
  }

  if (hasKeys) {
    params.set('where[location][in]', scope.keys.join(','))
    return
  }

  if (hasRefs) {
    params.set('where[locationRef][in]', scope.refs.join(','))
  }
}

export async function getArticleLocationScope(input: {
  locationKey: string
  sharedNeighborhoods?: number[]
  locations?: Array<Pick<LocationDoc, 'id' | 'locationKey'>>
  token: string
}): Promise<LocationScope> {
  const exactNeighborhoodScope = buildExactNeighborhoodScope(input.sharedNeighborhoods, input.locations)
  if (exactNeighborhoodScope) {
    return exactNeighborhoodScope
  }

  return getLocationScopeForKey(input.locationKey, input.token)
}

export function isLocationWithinArticleScope(input: {
  itemLocationKey?: string | null
  itemLocationRef?: unknown
  locationKey: string
  sharedNeighborhoods?: number[]
  locations?: Array<Pick<LocationDoc, 'id' | 'locationKey'>>
}): boolean {
  const exactNeighborhoodScope = buildExactNeighborhoodScope(input.sharedNeighborhoods, input.locations)
  if (exactNeighborhoodScope) {
    const itemLocationRefId = getRelationshipId(input.itemLocationRef)
    if (itemLocationRefId !== null && exactNeighborhoodScope.refs.includes(itemLocationRefId)) {
      return true
    }

    const normalizedItemLocationKey = normalizeLocationKey(input.itemLocationKey || '')
    if (!normalizedItemLocationKey) return false
    return exactNeighborhoodScope.keys.includes(normalizedItemLocationKey)
  }

  if (!input.itemLocationKey?.trim() || !input.locationKey.trim()) return false
  return isLocationWithinScope(input.itemLocationKey, input.locationKey)
}
