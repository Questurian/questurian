import { convertMarkdownToLexical, rewriteBlockWithAi } from '../staging/api'
import { appendScopedLocationWhere, getLocationScopeForKey } from '../locationScope/scope'
import type { LocationScope } from '../locationScope/types'
import type {
  ItineraryBlockType,
  LocationOption,
  MediaAssetOption,
  PayloadItineraryDoc,
  PayloadListResponse,
  RelatedItemOption,
  SeoMetadataForm,
  SeoMetadataOption,
} from './types'

const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

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
    const err = await response.json().catch(() => ({ message: 'Payload request failed' }))
    throw new Error(err.message || err.errors?.[0]?.message || `Payload request failed: ${response.status}`)
  }

  return response.json()
}

function relatedCollectionForBlockType(
  blockType: ItineraryBlockType,
): 'dining' | 'accommodations' | 'attractions' | 'nightlife' | 'key-locations' {
  switch (blockType) {
    case 'itinerary-dining':
      return 'dining'
    case 'itinerary-accommodations':
      return 'accommodations'
    case 'itinerary-attractions':
      return 'attractions'
    case 'itinerary-nightlife':
      return 'nightlife'
    case 'itinerary-key-location':
      return 'key-locations'
  }
}

export async function fetchItineraries(token: string): Promise<PayloadListResponse<PayloadItineraryDoc>> {
  return payloadRequest(`/api/listicle-itineraries?limit=100&sort=-updatedAt`, token)
}

export async function fetchItineraryById(id: number, token: string): Promise<PayloadItineraryDoc> {
  const response = await payloadRequest<{ doc: PayloadItineraryDoc }>(`/api/listicle-itineraries/${id}`, token)
  return response.doc
}

export async function createItinerary(body: Record<string, unknown>, token: string): Promise<PayloadItineraryDoc> {
  const response = await payloadRequest<{ doc: PayloadItineraryDoc }>(`/api/listicle-itineraries`, token, {
    method: 'POST',
    body: JSON.stringify(body),
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
  const response = await payloadRequest<PayloadListResponse<LocationOption>>(`/api/locations?limit=200`, token)
  return response.docs || []
}

export async function fetchMediaAssets(token: string): Promise<MediaAssetOption[]> {
  const response = await payloadRequest<PayloadListResponse<MediaAssetOption>>(
    `/api/media-assets?limit=200&where[mimeType][like]=image/`,
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
  const params = new URLSearchParams()
  params.set('depth', '0')
  params.set('limit', '200')
  params.set('where[status][equals]', 'published')

  if (locationKey) {
    const resolvedScope = scope || (await getLocationScopeForKey(locationKey, token))
    appendScopedLocationWhere(params, resolvedScope)
  }

  const response = await payloadRequest<PayloadListResponse<RelatedItemOption>>(
    `/api/${collection}?${params.toString()}`,
    token,
  )

  return response.docs || []
}

export async function fetchSeoMetadata(token: string): Promise<SeoMetadataOption[]> {
  const response = await payloadRequest<PayloadListResponse<SeoMetadataOption>>(
    `/api/seo-metadata?limit=200&sort=-updatedAt`,
    token,
  )
  return response.docs || []
}

export async function fetchSeoMetadataById(id: number, token: string): Promise<SeoMetadataForm> {
  const response = await payloadRequest<{ doc: SeoMetadataForm }>(`/api/seo-metadata/${id}`, token)
  return response.doc
}

export async function createSeoMetadata(payload: SeoMetadataForm, token: string): Promise<SeoMetadataForm> {
  const response = await payloadRequest<{ doc: SeoMetadataForm }>(`/api/seo-metadata`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return response.doc
}

export async function updateSeoMetadata(
  id: number,
  payload: SeoMetadataForm,
  token: string,
): Promise<SeoMetadataForm> {
  const response = await payloadRequest<{ doc: SeoMetadataForm }>(`/api/seo-metadata/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return response.doc
}

export async function markdownToLexical(markdown: string): Promise<Record<string, unknown>> {
  const result = await convertMarkdownToLexical(markdown)
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to convert markdown to lexical')
  }
  return result.data as Record<string, unknown>
}

export { rewriteBlockWithAi }
