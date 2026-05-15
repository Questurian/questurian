import { payloadMutation, payloadRequest } from '../client/http'
import type {
  ArticleCategory,
  ArticleTag,
  Location,
  MediaAsset,
  MediaSet,
  MediaSetPatch,
} from './payload.types'

export async function fetchLocations(
  token?: string,
  params?: {
    limit?: number
    page?: number
  },
): Promise<{ docs: Location[]; totalDocs: number; totalPages: number }> {
  const limit = params?.limit || 100

  if (params?.page) {
    const queryParams = new URLSearchParams()
    queryParams.append('limit', String(limit))
    queryParams.append('page', String(params.page))
    return payloadRequest(`/api/locations?${queryParams.toString()}`, token)
  }

  const allDocs: Location[] = []
  let page = 1
  let totalPages = 1
  let totalDocs = 0

  while (page <= totalPages) {
    const queryParams = new URLSearchParams()
    queryParams.append('limit', String(limit))
    queryParams.append('page', String(page))

    const response = (await payloadRequest(
      `/api/locations?${queryParams.toString()}`,
      token,
    )) as { docs: Location[]; totalDocs: number; totalPages: number }

    allDocs.push(...(response.docs || []))
    totalDocs = response.totalDocs || allDocs.length
    totalPages = response.totalPages || 1
    page += 1
  }

  return { docs: allDocs, totalDocs, totalPages }
}

export async function fetchArticleCategories(
  token?: string,
  params?: { limit?: number; status?: string },
): Promise<{ docs: ArticleCategory[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.status) queryParams.append('where[status][equals]', params.status)
  return payloadRequest(`/api/article-categories?${queryParams.toString()}`, token)
}

export async function fetchArticleTags(
  token?: string,
  params?: { limit?: number; status?: string },
): Promise<{ docs: ArticleTag[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.status) queryParams.append('where[status][equals]', params.status)
  return payloadRequest(`/api/article-tags?${queryParams.toString()}`, token)
}

export async function fetchMediaAssets(
  token?: string,
  params?: {
    limit?: number
    page?: number
    mimeType?: string
    variant?: MediaAsset['variant']
    minWidth?: number
    minHeight?: number
    width?: number
    height?: number
    id?: number
  },
): Promise<{ docs: MediaAsset[]; totalDocs: number; totalPages: number }> {
  const buildQuery = (page: number) => {
    const queryParams = new URLSearchParams()
    queryParams.append('limit', String(params?.limit || 50))
    queryParams.append('page', String(page))
    if (params?.mimeType) queryParams.append('where[mimeType][like]', params.mimeType)
    if (params?.variant) queryParams.append('where[variant][equals]', params.variant)
    if (params?.minWidth)
      queryParams.append('where[width][greater_than_equal]', String(params.minWidth))
    if (params?.minHeight)
      queryParams.append('where[height][greater_than_equal]', String(params.minHeight))
    if (params?.width) queryParams.append('where[width][equals]', String(params.width))
    if (params?.height) queryParams.append('where[height][equals]', String(params.height))
    if (params?.id) queryParams.append('where[id][equals]', String(params.id))
    return queryParams.toString()
  }
  return payloadRequest(`/api/media-assets?${buildQuery(params?.page || 1)}`, token)
}

export async function fetchMediaSets(
  token?: string,
  params?: {
    limit?: number
    page?: number
    id?: number | string
    status?: string
    locationId?: number
    search?: string
  },
): Promise<{ docs: MediaSet[]; totalDocs: number; totalPages: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('depth', '2')
  queryParams.append('limit', String(params?.limit || 24))
  queryParams.append('page', String(params?.page || 1))
  queryParams.append('sort', '-updatedAt')

  if (params?.id !== undefined && params.id !== null) {
    queryParams.append('where[id][equals]', String(params.id))
  }
  if (params?.status) {
    queryParams.append('where[status][equals]', params.status)
  }
  if (params?.locationId) {
    queryParams.append('where[location][equals]', String(params.locationId))
  }
  if (params?.search) {
    queryParams.append('where[title][like]', params.search)
  }

  return payloadRequest(`/api/media-sets?${queryParams.toString()}`, token)
}

export async function fetchAuditMediaSets(
  token?: string,
  params?: { limit?: number; page?: number },
): Promise<{ docs: MediaSet[]; totalDocs: number; totalPages: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('depth', '2')
  queryParams.append('limit', String(params?.limit || 50))
  queryParams.append('page', String(params?.page || 1))
  queryParams.append('sort', '-updatedAt')
  // Find MediaSets missing any of the required fields
  queryParams.append('where[or][0][alt_text][exists]', 'false')
  queryParams.append('where[or][1][photographer_credit][exists]', 'false')
  queryParams.append('where[or][2][location][exists]', 'false')
  queryParams.append('where[or][3][title][exists]', 'false')

  return payloadRequest(`/api/media-sets?${queryParams.toString()}`, token)
}

export async function fetchOrphanMediaAssets(
  token?: string,
  params?: { limit?: number; page?: number },
): Promise<{ docs: MediaAsset[]; totalDocs: number; totalPages: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('depth', '1')
  queryParams.append('limit', String(params?.limit || 50))
  queryParams.append('page', String(params?.page || 1))
  queryParams.append('sort', '-createdAt')
  queryParams.append('where[mediaSet][exists]', 'false')

  return payloadRequest(`/api/media-assets?${queryParams.toString()}`, token)
}

export async function updateMediaSet(
  id: number,
  patch: MediaSetPatch,
  token?: string,
): Promise<{ doc: MediaSet }> {
  return payloadMutation(`/api/media-sets/${id}`, 'PATCH', patch, token)
}

export async function updateMediaAsset(
  id: number,
  patch: Partial<Pick<MediaAsset, 'alt_text' | 'photographer_credit' | 'location' | 'location_finalized' | 'tags'>>,
  token?: string,
): Promise<{ doc: MediaAsset }> {
  return payloadMutation(`/api/media-assets/${id}`, 'PATCH', patch, token)
}
