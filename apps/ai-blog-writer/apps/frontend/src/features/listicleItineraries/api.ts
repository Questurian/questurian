import { composeItineraryBriefWithAi, convertMarkdownToLexical, generateListicleContentWithAi, generateTitleWithAi, rewriteBlockWithAi } from '../staging/api'
import { appendScopedLocationWhere, getArticleLocationScope } from '../../shared/locationScope/scope'
import { normalizeRelatedItems } from '../../shared/related-items/normalizeRelatedItems'
import type { LocationScope } from '../../shared/locationScope/types'
import type {
  InstagramPostOption,
  ItineraryBlockType,
  LocationOption,
  MediaAssetOption,
  PayloadItineraryDoc,
  PayloadListResponse,
  RelatedItemOption,
} from './types'

const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

function formatFieldError(entry: Record<string, unknown>): string {
  const msg = typeof entry.message === 'string' ? entry.message.trim() : ''
  const path = Array.isArray(entry.path)
    ? entry.path.filter((p) => typeof p === 'string' || typeof p === 'number').join('.')
    : typeof entry.path === 'string'
      ? entry.path
      : ''
  const data = entry.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).errors
    if (Array.isArray(nested) && nested.length > 0) {
      const inner = nested
        .map((item) => {
          if (!item || typeof item !== 'object') return ''
          return formatFieldError(item as Record<string, unknown>)
        })
        .filter(Boolean)
        .join('; ')
      if (inner) return inner
    }
  }
  if (msg && path) return `${path}: ${msg}`
  return msg || path
}

function formatPayloadHttpError(body: unknown, status: number): string {
  if (!body || typeof body !== 'object') {
    return `Payload request failed (${status})`
  }
  const record = body as Record<string, unknown>
  const rootMessage = typeof record.message === 'string' ? record.message.trim() : ''

  const errors = record.errors
  if (Array.isArray(errors) && errors.length > 0) {
    const detail = errors
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (!entry || typeof entry !== 'object') return ''
        return formatFieldError(entry as Record<string, unknown>)
      })
      .filter(Boolean)
      .join('; ')
    if (detail) {
      return rootMessage ? `${rootMessage} — ${detail}` : detail
    }
  }

  return rootMessage || `Payload request failed (${status})`
}

async function payloadRequest<T>(endpoint: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const errBody = await response.json().catch(() => null)
    throw new Error(formatPayloadHttpError(errBody, response.status))
  }

  return response.json()
}

function relatedCollectionForBlockType(
  blockType: ItineraryBlockType,
): 'dining' | 'accommodations' | 'attractions' | 'nightlife' | 'key-locations' | null {
  switch (blockType) {
    case 'itinerary-dining':
      return 'dining'
    case 'itinerary-accommodations':
    case 'itinerary-where-staying':
      return 'accommodations'
    case 'itinerary-attractions':
      return 'attractions'
    case 'itinerary-nightlife':
      return 'nightlife'
    case 'itinerary-key-location':
      return 'key-locations'
    case 'itinerary-tour-agency':
      return null
  }
}

export async function fetchItineraries(token: string): Promise<PayloadListResponse<PayloadItineraryDoc>> {
  return payloadRequest(`/api/listicle-itineraries?limit=100&sort=-updatedAt`, token)
}

export async function fetchItineraryById(id: number, token: string): Promise<PayloadItineraryDoc> {
  return payloadRequest<PayloadItineraryDoc>(`/api/listicle-itineraries/${id}`, token)
}

export async function createItinerary(body: Record<string, unknown>, token: string): Promise<PayloadItineraryDoc> {
  const safeBody = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'id'))
  const response = await payloadRequest<{ doc: PayloadItineraryDoc }>(`/api/listicle-itineraries`, token, {
    method: 'POST',
    body: JSON.stringify(safeBody),
  })
  return response.doc
}

export async function updateItinerary(
  id: number,
  body: Record<string, unknown>,
  token: string,
): Promise<PayloadItineraryDoc> {
  const response = await payloadRequest<{ doc: PayloadItineraryDoc }>(`/api/listicle-itineraries/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return response.doc
}

export async function fetchLocations(token: string): Promise<LocationOption[]> {
  const allDocs: LocationOption[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const response = await payloadRequest<PayloadListResponse<LocationOption>>(
      `/api/locations?limit=200&page=${page}&depth=0`,
      token,
    )

    allDocs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return allDocs
}

export async function fetchMediaAssets(
  token: string,
  params?: { id?: number },
): Promise<MediaAssetOption[]> {
  const queryParams = new URLSearchParams()
  queryParams.set('limit', '200')
  queryParams.set('where[mimeType][like]', 'image/')
  if (typeof params?.id === 'number') {
    queryParams.set('where[id][equals]', String(params.id))
  }

  const response = await payloadRequest<PayloadListResponse<MediaAssetOption>>(
    `/api/media-assets?${queryParams.toString()}`,
    token,
  )
  return response.docs || []
}

export async function fetchInstagramPosts(
  token: string,
  params?: { id?: number },
): Promise<InstagramPostOption[]> {
  const queryParams = new URLSearchParams()
  queryParams.set('depth', '1')
  queryParams.set('limit', '200')

  if (typeof params?.id === 'number') {
    queryParams.set('where[id][equals]', String(params.id))
  }

  const response = await payloadRequest<PayloadListResponse<InstagramPostOption>>(
    `/api/instagram-posts?${queryParams.toString()}`,
    token,
  )

  return response.docs || []
}

export async function fetchRelatedItems(
  blockType: ItineraryBlockType,
  locationKey: string,
  token: string,
  scope?: LocationScope,
): Promise<RelatedItemOption[]> {
  const collection = relatedCollectionForBlockType(blockType)
  if (!collection) {
    return []
  }
  const params = new URLSearchParams()
  params.set('depth', '2')
  params.set('limit', '200')
  params.set('where[status][equals]', 'published')

  if (locationKey) {
    const resolvedScope = scope || (await getArticleLocationScope({ locationKey, token }))
    appendScopedLocationWhere(params, resolvedScope)
  }

  const response = await payloadRequest<PayloadListResponse<RelatedItemOption>>(
    `/api/${collection}?${params.toString()}`,
    token,
  )

  return normalizeRelatedItems(response.docs || [])
}

export async function markdownToLexical(markdown: string): Promise<Record<string, unknown>> {
  const result = await convertMarkdownToLexical(markdown)
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to convert markdown to lexical')
  }
  return result.data as Record<string, unknown>
}

export { composeItineraryBriefWithAi, generateListicleContentWithAi, generateTitleWithAi, rewriteBlockWithAi }
