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

const HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS = 12000

export type MainHomepageResponse = {
  pageBlocks: PageBlockResponse[]
}

export type DeleteHomepageBlockResponse = {
  deletedBlockId: string
}

export type ReorderHomepageBlocksResponse = {
  orderedBlockIds: string[]
}

export type ConvertHomepageBlockResponse = {
  block: PageBlockResponse
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
  const externalSignal = init?.signal
  let didTimeout = false
  const timeoutId = window.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS)
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason)

  if (externalSignal?.aborted) {
    abortFromExternalSignal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true })
  }

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
    if (didTimeout && error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Homepage featured content request timed out after ${Math.round(HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS / 1000)}s`,
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromExternalSignal)
  }
}

export async function fetchMainHomepage(
  token: string,
  signal?: AbortSignal,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, { signal })
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

export async function updateMainHomepageFeaturedSectionHeading(
  token: string,
  blockId: string,
  sectionHeading: string | null,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionHeading }),
  })
}

export async function updateMainHomepageFeaturedSectionSubheading(
  token: string,
  blockId: string,
  sectionSubheading: string | null,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionSubheading }),
  })
}

export async function updateMainHomepageFeaturedSlot3Layout(
  token: string,
  blockId: string,
  slot3Layout: FeaturedArticlesSlot3Layout,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot3Layout }),
  })
}

export async function updateMainHomepageFeaturedSlot4Layout(
  token: string,
  blockId: string,
  slot4Layout: FeaturedArticlesSlot4Layout,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot4Layout }),
  })
}

export async function updateMainHomepageFeaturedSlot5Layout(
  token: string,
  blockId: string,
  slot5Layout: FeaturedArticlesSlot5Layout,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot5Layout }),
  })
}

export async function updateMainHomepageLocationGridMediaAspect(
  token: string,
  blockId: string,
  mediaAspect: LocationGridMediaAspect,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, mediaAspect }),
  })
}

export async function updateMainHomepageArticleGridFourLayout(
  token: string,
  blockId: string,
  articleGridFourLayout: ArticleGridFourLayout,
): Promise<MainHomepageResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, articleGridFourLayout }),
  })
}

/** When a Featured Articles block has no saved items, switch it to another block type; keeps section title. */
export async function convertMainHomepageFeaturedArticlesBlock(
  token: string,
  blockId: string,
  blockType: string,
  slotCount: number,
): Promise<ConvertHomepageBlockResponse> {
  return homepageFeaturedRequest(
    '/api/homepage-featured-content/blocks/convert?response=lean',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ blockId, blockType, slotCount }),
    },
  )
}

export async function addMainHomepageBlock(
  token: string,
  blockType: string,
  slotCount: number,
  sectionHeading?: string | null,
  sectionSubheading?: string | null,
): Promise<MainHomepageResponse> {
  const body: Record<string, unknown> = { blockType, slotCount }
  if (typeof sectionHeading === 'string' && sectionHeading.trim()) {
    body.sectionHeading = sectionHeading.trim()
  }
  if (typeof sectionSubheading === 'string' && sectionSubheading.trim()) {
    body.sectionSubheading = sectionSubheading.trim()
  }
  return homepageFeaturedRequest('/api/homepage-featured-content/blocks', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteMainHomepageBlock(
  token: string,
  blockId: string,
): Promise<DeleteHomepageBlockResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content/blocks?response=lean', token, {
    method: 'DELETE',
    body: JSON.stringify({ blockId }),
  })
}

export async function reorderMainHomepageBlocks(
  token: string,
  orderedBlockIds: string[],
): Promise<ReorderHomepageBlocksResponse> {
  return homepageFeaturedRequest('/api/homepage-featured-content/blocks?response=lean', token, {
    method: 'PATCH',
    body: JSON.stringify({ orderedBlockIds }),
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

export async function fetchWhereToEatDrinkCandidates(
  token: string,
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
  return homepageFeaturedRequest(
    `/api/homepage-featured-content/where-to-eat-drink-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchThingsToDoListicleCandidates(
  token: string,
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
  return homepageFeaturedRequest(
    `/api/homepage-featured-content/things-to-do-listicle-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchTourGridCandidates(
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
    `/api/homepage-featured-content/tour-candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchThingsToDoAttractionCandidates(
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
    `/api/homepage-featured-content/things-to-do-attraction-candidates${query ? `?${query}` : ''}`,
    token,
  )
}
