import type { LocationListResponse, LocationScope } from './types'

const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

const normalizeSegment = (segment: string): string => segment.trim().toLowerCase()

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
      if (doc.locationKey) keySet.add(doc.locationKey)
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
