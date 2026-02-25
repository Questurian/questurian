import { convertMarkdownToLexical, rewriteBlockWithAi } from '../staging/api'
import { appendScopedLocationWhere, getLocationScopeForKey } from '../locationScope/scope'
import type {
  ListicleType,
  LocationOption,
  MediaAssetOption,
  PayloadListicleDoc,
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

function relatedCollectionForType(type: ListicleType): 'dining' | 'accommodations' | 'attractions' | 'nightlife' {
  switch (type) {
    case 'dining':
      return 'dining'
    case 'accommodations':
      return 'accommodations'
    case 'attractions':
      return 'attractions'
    case 'nightlife':
      return 'nightlife'
  }
}

export function getBlockTypeForListicleType(type: ListicleType) {
  switch (type) {
    case 'dining':
      return 'data-dining' as const
    case 'accommodations':
      return 'data-accommodations' as const
    case 'attractions':
      return 'data-attractions' as const
    case 'nightlife':
      return 'data-nightlife' as const
  }
}

export async function fetchListicles(token: string): Promise<PayloadListResponse<PayloadListicleDoc>> {
  return payloadRequest(`/api/single-type-listicles?limit=100&sort=-updatedAt`, token)
}

export async function fetchListicleById(id: number, token: string): Promise<PayloadListicleDoc> {
  const response = await payloadRequest<{ doc: PayloadListicleDoc }>(`/api/single-type-listicles/${id}`, token)
  return response.doc
}

export async function createListicle(body: Record<string, unknown>, token: string): Promise<PayloadListicleDoc> {
  const response = await payloadRequest<{ doc: PayloadListicleDoc }>(`/api/single-type-listicles`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return response.doc
}

export async function updateListicle(
  id: number,
  body: Record<string, unknown>,
  token: string,
): Promise<PayloadListicleDoc> {
  const response = await payloadRequest<{ doc: PayloadListicleDoc }>(`/api/single-type-listicles/${id}`, token, {
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
  listicleType: ListicleType,
  locationKey: string,
  token: string,
): Promise<RelatedItemOption[]> {
  const collection = relatedCollectionForType(listicleType)
  const params = new URLSearchParams()
  params.set('limit', '200')
  params.set('where[status][equals]', 'published')
  if (locationKey) {
    const scope = await getLocationScopeForKey(locationKey, token)
    appendScopedLocationWhere(params, scope)
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
