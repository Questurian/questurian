import { PAYLOAD_API_URL } from '../../shared/api/client/config'
import type {
  LocationIndexRow,
  MediaSetOption,
  PayloadListResponse,
  PayloadLocationBody,
  PayloadLocationDoc,
} from './types'

export type LocationIndexFilters = {
  level?: string
  countryName?: string
  cityName?: string
  neighborhoodName?: string
  locationKey?: string
}

const PAYLOAD_REQUEST_TIMEOUT_MS = 12000

async function payloadRequest<T>(
  endpoint: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), PAYLOAD_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Payload request failed' }))
      throw new Error(err.message || err.errors?.[0]?.message || `Payload request failed: ${response.status}`)
    }

    return response.json()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Payload request timed out after ${Math.round(PAYLOAD_REQUEST_TIMEOUT_MS / 1000)}s`)
    }

    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function isPayloadLocationDoc(value: unknown): value is PayloadLocationDoc {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { id?: unknown }
  return typeof candidate.id === 'number' && Number.isFinite(candidate.id)
}

function parsePayloadLocationDocResponse(
  response: unknown,
  operation: string,
): PayloadLocationDoc {
  if (isPayloadLocationDoc(response)) {
    return response
  }

  if (response && typeof response === 'object') {
    const wrappedDoc = (response as { doc?: unknown }).doc
    if (isPayloadLocationDoc(wrappedDoc)) {
      return wrappedDoc
    }
  }

  const keys = response && typeof response === 'object'
    ? Object.keys(response as Record<string, unknown>).slice(0, 10)
    : []
  const details = keys.length > 0 ? `keys: ${keys.join(', ')}` : `type: ${typeof response}`
  throw new Error(`${operation} returned an unexpected response shape (${details}).`)
}

function appendSelectParams(params: URLSearchParams, fields: string[]) {
  for (const field of fields) {
    params.set(`select[${field}]`, 'true')
  }
}

function appendIndexFilters(params: URLSearchParams, filters: LocationIndexFilters) {
  if (filters.level) {
    params.set('where[level][equals]', filters.level)
  }

  if (filters.countryName) {
    params.set('where[countryName][like]', filters.countryName)
  }

  if (filters.cityName) {
    params.set('where[cityName][like]', filters.cityName)
  }

  if (filters.neighborhoodName) {
    params.set('where[neighborhoodName][like]', filters.neighborhoodName)
  }

  if (filters.locationKey) {
    params.set('where[locationKey][like]', filters.locationKey)
  }
}

export async function fetchLocationsIndex(
  token: string,
  filters: LocationIndexFilters = {},
): Promise<LocationIndexRow[]> {
  const docs: LocationIndexRow[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams()
    params.set('depth', '0')
    params.set('limit', '100')
    params.set('sort', '-updatedAt')
    params.set('page', String(page))
    appendSelectParams(params, [
      'id',
      'level',
      'country',
      'city',
      'neighborhood',
      'countryName',
      'cityName',
      'neighborhoodName',
      'locationKey',
      'parentKey',
      'coverImage',
      'updatedAt',
    ])
    appendIndexFilters(params, filters)

    const response = await payloadRequest<PayloadListResponse<LocationIndexRow>>(
      `/api/locations?${params.toString()}`,
      token,
    )
    docs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return docs
}

export async function fetchLocationById(
  id: number,
  token: string,
): Promise<PayloadLocationDoc> {
  const response = await payloadRequest<unknown>(`/api/locations/${id}?depth=0`, token)
  return parsePayloadLocationDocResponse(response, 'Fetch location')
}

export async function updateLocation(
  id: number,
  body: PayloadLocationBody,
  token: string,
): Promise<PayloadLocationDoc> {
  const response = await payloadRequest<unknown>(`/api/locations/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return parsePayloadLocationDocResponse(response, 'Update location')
}

export async function fetchMediaSetOptions(token: string): Promise<MediaSetOption[]> {
  const docs: MediaSetOption[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams()
    params.set('depth', '0')
    params.set('limit', '200')
    params.set('page', String(page))
    params.set('sort', 'title')
    appendSelectParams(params, ['id', 'title', 'alt_text', 'location'])

    const response = await payloadRequest<PayloadListResponse<MediaSetOption>>(
      `/api/media-sets?${params.toString()}`,
      token,
    )
    docs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return docs
}

export async function fetchMediaSetLibrary(
  token: string,
  params: {
    /** Page size when listing all sets (default 200). Ignored when `id` is set. */
    limit?: number
    id?: number
  } = {},
): Promise<MediaSetOption[]> {
  if (params.id) {
    const query = new URLSearchParams()
    query.set('depth', '2')
    query.set('limit', '1')
    query.set('sort', '-updatedAt')
    query.set('where[id][equals]', String(params.id))
    const response = await payloadRequest<PayloadListResponse<MediaSetOption>>(
      `/api/media-sets?${query.toString()}`,
      token,
    )
    return response.docs || []
  }

  const pageSize = params.limit ?? 200
  const docs: MediaSetOption[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const query = new URLSearchParams()
    query.set('depth', '2')
    query.set('limit', String(pageSize))
    query.set('page', String(page))
    query.set('sort', '-updatedAt')

    const response = await payloadRequest<PayloadListResponse<MediaSetOption>>(
      `/api/media-sets?${query.toString()}`,
      token,
    )
    docs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return docs
}
