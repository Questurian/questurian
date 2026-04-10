import { PAYLOAD_API_URL } from '../staging/api/client/config'
import { parseErrorResponse } from '../staging/api/client/error-parser'
import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedCollection,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'

const LOCATION_HOMEPAGE_REQUEST_TIMEOUT_MS = 12000

// ── Types ──────────────────────────────────────────────────────────────────

export type LocationRef = {
  id: number
  locationKey: string | null
  level: string | null
  countryName: string | null
  cityName?: string | null
  neighborhoodName?: string | null
}

export type LocationHomepageListItem = {
  id: number
  isEnabled: boolean
  updatedAt: string | null
  location: LocationRef | null
}

export type FeaturedArticlesBlockResponse = {
  id: string
  blockType: 'featured-articles'
  selection: HomepageFeaturedSelection
}

export type UnknownBlockResponse = {
  id: string
  blockType: string
}

export type PageBlockResponse = FeaturedArticlesBlockResponse | UnknownBlockResponse

export type LocationHomepageResponse = {
  id: number
  isEnabled: boolean
  location: LocationRef | null
  pageBlocks: PageBlockResponse[]
}

// ── Request helper ─────────────────────────────────────────────────────────

async function locationHomepageRequest<T>(
  endpoint: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    LOCATION_HOMEPAGE_REQUEST_TIMEOUT_MS,
  )

  try {
    const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
      ...init,
      mode: 'cors',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    })

    if (!response.ok) {
      const message = await parseErrorResponse(
        response,
        `Location homepage request failed: ${response.status}`,
      )
      throw new Error(message)
    }

    return response.json()
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Location homepage request timed out after ${Math.round(LOCATION_HOMEPAGE_REQUEST_TIMEOUT_MS / 1000)}s`,
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

// ── API functions ──────────────────────────────────────────────────────────

export async function fetchLocationHomepagesList(
  token: string,
): Promise<LocationHomepageListItem[]> {
  return locationHomepageRequest('/api/location-homepages', token)
}

export async function createLocationHomepage(
  token: string,
  locationId: number,
): Promise<{ id: number }> {
  return locationHomepageRequest('/api/location-homepages', token, {
    method: 'POST',
    body: JSON.stringify({ locationId }),
  })
}

export async function fetchLocationHomepage(
  token: string,
  id: number,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, token)
}

export async function updateLocationHomepageBlock(
  token: string,
  id: number,
  blockId: string,
  items: HomepageFeaturedItemRef[],
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, items }),
  })
}

export async function addLocationHomepageBlock(
  token: string,
  id: number,
  blockType: string,
  slotCount: number,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}/blocks`, token, {
    method: 'POST',
    body: JSON.stringify({ blockType, slotCount }),
  })
}

export async function deleteLocationHomepage(token: string, id: number): Promise<void> {
  await locationHomepageRequest(`/api/location-homepages/${id}`, token, {
    method: 'DELETE',
  })
}

export async function toggleLocationHomepage(
  token: string,
  id: number,
): Promise<{ id: number; isEnabled: boolean }> {
  return locationHomepageRequest(`/api/location-homepages/${id}/toggle`, token, {
    method: 'PATCH',
  })
}

export async function fetchLocationHomepageCandidates(
  token: string,
  id: number,
  params: {
    query?: string
    type?: HomepageFeaturedCollection | 'all'
    page?: number
    limit?: number
  } = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) {
    searchParams.set('q', params.query.trim())
  }

  if (params.type && params.type !== 'all') {
    searchParams.set('type', params.type)
  }

  if (params.page) {
    searchParams.set('page', String(params.page))
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  return locationHomepageRequest(
    `/api/location-homepages/${id}/candidates${query ? `?${query}` : ''}`,
    token,
  )
}
