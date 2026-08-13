import {
  appendScopedLocationWhere,
  getArticleLocationScope
} from '../../../shared/locationScope/scope'
import type { LocationScope } from '../../../shared/locationScope/types'
import { normalizeRelatedItems } from '../../../shared/related-items/normalizeRelatedItems'
import type {
  InstagramPostOption,
  ItineraryBlockType,
  LocationOption,
  MediaAssetOption,
  PayloadItineraryDoc,
  PayloadListResponse,
  RelatedItemOption
} from '../types'
import { payloadRequest } from './payloadClient'

function relatedCollectionForBlockType(
  blockType: ItineraryBlockType
):
  | 'dining'
  | 'accommodations'
  | 'attractions'
  | 'nightlife'
  | 'key-locations'
  | null {
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

export async function fetchItineraries(
): Promise<PayloadListResponse<PayloadItineraryDoc>> {
  const params = new URLSearchParams()
  params.set('depth', '0')
  params.set('limit', '100')
  params.set('sort', '-updatedAt')

  for (const field of ['id', 'title', 'location', 'status', 'updatedAt']) {
    params.set(`select[${field}]`, 'true')
  }

  return payloadRequest(`/api/listicle-itineraries?${params.toString()}`)
}

export async function fetchItineraryById(
  id: number,
): Promise<PayloadItineraryDoc> {
  return payloadRequest<PayloadItineraryDoc>(
    `/api/listicle-itineraries/${id}`,
  )
}

export async function createItinerary(
  body: Record<string, unknown>,
): Promise<PayloadItineraryDoc> {
  const safeBody = Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'id')
  )
  const response = await payloadRequest<{ doc: PayloadItineraryDoc }>(
    `/api/listicle-itineraries`,
    {
      method: 'POST',
      body: JSON.stringify(safeBody)
    }
  )
  return response.doc
}

export async function updateItinerary(
  id: number,
  body: Record<string, unknown>,
): Promise<PayloadItineraryDoc> {
  const response = await payloadRequest<{ doc: PayloadItineraryDoc }>(
    `/api/listicle-itineraries/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body)
    }
  )
  return response.doc
}

export async function fetchLocations(): Promise<LocationOption[]> {
  const allDocs: LocationOption[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const response = await payloadRequest<PayloadListResponse<LocationOption>>(
      `/api/locations?limit=200&page=${page}&depth=0`,
    )

    allDocs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return allDocs
}

export async function fetchMediaAssets(
  params?: { id?: number }
): Promise<MediaAssetOption[]> {
  const queryParams = new URLSearchParams()
  queryParams.set('limit', '200')
  queryParams.set('where[mimeType][like]', 'image/')
  if (typeof params?.id === 'number') {
    queryParams.set('where[id][equals]', String(params.id))
  }

  const response = await payloadRequest<PayloadListResponse<MediaAssetOption>>(
    `/api/media-assets?${queryParams.toString()}`,
  )
  return response.docs || []
}

export async function fetchInstagramPosts(
  params?: { id?: number }
): Promise<InstagramPostOption[]> {
  const queryParams = new URLSearchParams()
  queryParams.set('depth', '1')
  queryParams.set('limit', '200')

  if (typeof params?.id === 'number') {
    queryParams.set('where[id][equals]', String(params.id))
  }

  const response = await payloadRequest<
    PayloadListResponse<InstagramPostOption>
  >(`/api/instagram-posts?${queryParams.toString()}`)

  return response.docs || []
}

export async function fetchRelatedItems(
  blockType: ItineraryBlockType,
  locationKey: string,
  scope?: LocationScope
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
    const resolvedScope =
      scope || (await getArticleLocationScope({ locationKey }))
    appendScopedLocationWhere(params, resolvedScope)
  }

  const response = await payloadRequest<PayloadListResponse<RelatedItemOption>>(
    `/api/${collection}?${params.toString()}`,
  )

  return normalizeRelatedItems(response.docs || [])
}
