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
} from './locationGridTypes'
import type {
  HomepageHotelGridCandidatesResponse,
  HomepageHotelGridItemRef,
} from './hotelGridTypes'
import type { PageBlockResponse } from './pageBlocks'

const HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS = 12000

export type MainHomepageResponse = {
  pageBlocks: PageBlockResponse[]
}

type HomepageBlockSaveItem =
  | HomepageFeaturedItemRef
  | HomepageLocationGridItemRef
  | HomepageHotelGridItemRef

async function homepageFeaturedRequest<T>(
  endpoint: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS)

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
        `Homepage featured content request failed: ${response.status}`,
      )
      throw new Error(message)
    }

    return response.json()
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Homepage featured content request timed out after ${Math.round(HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS / 1000)}s`,
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function fetchMainHomepage(token: string): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token)
}

export async function updateMainHomepageBlock(
  token: string,
  blockId: string,
  items: HomepageBlockSaveItem[],
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, items }),
  })
}

export async function addMainHomepageBlock(
  token: string,
  blockType: string,
  slotCount: number,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content/blocks', token, {
    method: 'POST',
    body: JSON.stringify({ blockType, slotCount }),
  })
}

export async function deleteMainHomepageBlock(
  token: string,
  blockId: string,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content/blocks', token, {
    method: 'DELETE',
    body: JSON.stringify({ blockId }),
  })
}

export async function fetchHomepageFeaturedCandidates(
  token: string,
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
  return homepageFeaturedRequest(
    `/api/homepage-featured-content/candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchHomepageLocationGridCandidates(
  token: string,
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
  return homepageFeaturedRequest(
    `/api/homepage-featured-content/location-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchHomepageHotelGridCandidates(
  token: string,
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
  return homepageFeaturedRequest(
    `/api/homepage-featured-content/hotel-candidates${query ? `?${query}` : ''}`,
    token,
  )
}
