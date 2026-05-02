import { PAYLOAD_API_URL } from '../staging/api/client/config'
import { parseErrorResponse } from '../staging/api/client/error-parser'
import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedCollection,
  HomepageFeaturedItemRef,
} from './types'
import type {
  HomepageLocationGridCandidatesResponse,
  HomepageLocationGridItemRef,
  LocationGridMediaAspect,
} from './locationGridTypes'
import type {
  HomepageHotelGridCandidatesResponse,
  HomepageHotelGridItemRef,
} from './hotelGridTypes'
import type {
  ArticleGridFourLayout,
  FeaturedArticlesSlot3Layout,
  FeaturedArticlesSlot4Layout,
  FeaturedArticlesSlot5Layout,
  PageBlockResponse,
} from './pageBlocks'

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

export type { ArticleGridBlockResponse, FeaturedArticlesBlockResponse, PageBlockResponse } from './pageBlocks'

export type LocationHomepageResponse = {
  id: number
  isEnabled: boolean
  location: LocationRef | null
  pageBlocks: PageBlockResponse[]
}

export type DeleteLocationHomepageBlockResponse = {
  deletedBlockId: string
}

export type ReorderLocationHomepageBlocksResponse = {
  orderedBlockIds: string[]
}

export type ConvertLocationHomepageBlockResponse = {
  block: PageBlockResponse
}

type HomepageBlockSaveItem =
  | HomepageFeaturedItemRef
  | HomepageLocationGridItemRef
  | HomepageHotelGridItemRef

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
  items: HomepageBlockSaveItem[],
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, items }),
  })
}

export async function updateLocationHomepageFeaturedSectionHeading(
  token: string,
  id: number,
  blockId: string,
  sectionHeading: string | null,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionHeading }),
  })
}

export async function updateLocationHomepageFeaturedSectionSubheading(
  token: string,
  id: number,
  blockId: string,
  sectionSubheading: string | null,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionSubheading }),
  })
}

export async function updateLocationHomepageFeaturedSlot3Layout(
  token: string,
  homepageId: number,
  blockId: string,
  slot3Layout: FeaturedArticlesSlot3Layout,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${homepageId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot3Layout }),
  })
}

export async function updateLocationHomepageFeaturedSlot4Layout(
  token: string,
  homepageId: number,
  blockId: string,
  slot4Layout: FeaturedArticlesSlot4Layout,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${homepageId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot4Layout }),
  })
}

export async function updateLocationHomepageFeaturedSlot5Layout(
  token: string,
  homepageId: number,
  blockId: string,
  slot5Layout: FeaturedArticlesSlot5Layout,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${homepageId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot5Layout }),
  })
}

export async function updateLocationHomepageLocationGridMediaAspect(
  token: string,
  homepageId: number,
  blockId: string,
  mediaAspect: LocationGridMediaAspect,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${homepageId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, mediaAspect }),
  })
}

export async function updateLocationHomepageArticleGridFourLayout(
  token: string,
  homepageId: number,
  blockId: string,
  articleGridFourLayout: ArticleGridFourLayout,
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${homepageId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, articleGridFourLayout }),
  })
}

/** When a Featured Articles block has no saved items, switch it to another block type; keeps section title. */
export async function convertLocationHomepageFeaturedArticlesBlock(
  token: string,
  homepageId: number,
  blockId: string,
  blockType: string,
  slotCount: number,
): Promise<ConvertLocationHomepageBlockResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${homepageId}/blocks/convert?response=lean`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ blockId, blockType, slotCount }),
    },
  )
}

export async function addLocationHomepageBlock(
  token: string,
  id: number,
  blockType: string,
  slotCount: number,
  sectionHeading?: string | null,
  sectionSubheading?: string | null,
): Promise<LocationHomepageResponse> {
  const body: Record<string, unknown> = { blockType, slotCount }
  if (typeof sectionHeading === 'string' && sectionHeading.trim()) {
    body.sectionHeading = sectionHeading.trim()
  }
  if (typeof sectionSubheading === 'string' && sectionSubheading.trim()) {
    body.sectionSubheading = sectionSubheading.trim()
  }
  return locationHomepageRequest(`/api/location-homepages/${id}/blocks`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteLocationHomepageBlock(
  token: string,
  id: number,
  blockId: string,
): Promise<DeleteLocationHomepageBlockResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}/blocks?response=lean`, token, {
    method: 'DELETE',
    body: JSON.stringify({ blockId }),
  })
}

export async function reorderLocationHomepageBlocks(
  token: string,
  id: number,
  orderedBlockIds: string[],
): Promise<ReorderLocationHomepageBlocksResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}/blocks?response=lean`, token, {
    method: 'PATCH',
    body: JSON.stringify({ orderedBlockIds }),
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

export async function fetchLocationHomepageLocationGridCandidates(
  token: string,
  id: number,
  params: {
    query?: string
    page?: number
    limit?: number
  } = {},
): Promise<HomepageLocationGridCandidatesResponse> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) {
    searchParams.set('q', params.query.trim())
  }

  if (params.page) {
    searchParams.set('page', String(params.page))
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  return locationHomepageRequest(
    `/api/location-homepages/${id}/location-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchLocationHomepageHotelGridCandidates(
  token: string,
  id: number,
  params: {
    query?: string
    page?: number
    limit?: number
  } = {},
): Promise<HomepageHotelGridCandidatesResponse> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) {
    searchParams.set('q', params.query.trim())
  }

  if (params.page) {
    searchParams.set('page', String(params.page))
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  return locationHomepageRequest(
    `/api/location-homepages/${id}/hotel-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchLocationHomepageTourGridCandidates(
  token: string,
  id: number,
  params: {
    query?: string
    page?: number
    limit?: number
  } = {},
): Promise<HomepageHotelGridCandidatesResponse> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) {
    searchParams.set('q', params.query.trim())
  }

  if (params.page) {
    searchParams.set('page', String(params.page))
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  return locationHomepageRequest(
    `/api/location-homepages/${id}/tour-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchLocationHomepageWhereToEatDrinkCandidates(
  token: string,
  id: number,
  params: {
    query?: string
    page?: number
    limit?: number
  } = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) {
    searchParams.set('q', params.query.trim())
  }

  if (params.page) {
    searchParams.set('page', String(params.page))
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  return locationHomepageRequest(
    `/api/location-homepages/${id}/where-to-eat-drink-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchLocationHomepageThingsToDoListicleCandidates(
  token: string,
  id: number,
  params: {
    query?: string
    page?: number
    limit?: number
  } = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) {
    searchParams.set('q', params.query.trim())
  }

  if (params.page) {
    searchParams.set('page', String(params.page))
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  return locationHomepageRequest(
    `/api/location-homepages/${id}/things-to-do-listicle-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchLocationHomepageThingsToDoAttractionCandidates(
  token: string,
  id: number,
  params: {
    query?: string
    page?: number
    limit?: number
  } = {},
): Promise<HomepageHotelGridCandidatesResponse> {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) {
    searchParams.set('q', params.query.trim())
  }

  if (params.page) {
    searchParams.set('page', String(params.page))
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  return locationHomepageRequest(
    `/api/location-homepages/${id}/things-to-do-attraction-candidates${query ? `?${query}` : ''}`,
    token,
  )
}
