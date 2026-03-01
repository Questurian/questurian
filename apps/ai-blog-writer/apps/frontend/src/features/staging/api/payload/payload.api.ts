import { payloadRequest } from '../client/http'
import type { ArticleCategory, ArticleTag, Location, MediaAsset } from './payload.types'

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

    const response = await payloadRequest(
      `/api/locations?${queryParams.toString()}`,
      token,
    ) as { docs: Location[]; totalDocs: number; totalPages: number }

    allDocs.push(...(response.docs || []))
    totalDocs = response.totalDocs || allDocs.length
    totalPages = response.totalPages || 1
    page += 1
  }

  return {
    docs: allDocs,
    totalDocs,
    totalPages,
  }
}

export async function fetchArticleCategories(
  token?: string,
  params?: {
    limit?: number
    status?: string
  },
): Promise<{ docs: ArticleCategory[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.status) queryParams.append('where[status][equals]', params.status)

  return payloadRequest(`/api/article-categories?${queryParams.toString()}`, token)
}

export async function fetchArticleTags(
  token?: string,
  params?: {
    limit?: number
    status?: string
  },
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
    mimeType?: string
    variant?: MediaAsset['variant']
    minWidth?: number
    minHeight?: number
    width?: number
    height?: number
    id?: number
  },
): Promise<{ docs: MediaAsset[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 50))
  if (params?.mimeType) queryParams.append('where[mimeType][like]', params.mimeType)
  if (params?.variant) queryParams.append('where[variant][equals]', params.variant)
  if (params?.minWidth) {
    queryParams.append('where[width][greater_than_equal]', String(params.minWidth))
  }
  if (params?.minHeight) {
    queryParams.append('where[height][greater_than_equal]', String(params.minHeight))
  }
  if (params?.width) {
    queryParams.append('where[width][equals]', String(params.width))
  }
  if (params?.height) {
    queryParams.append('where[height][equals]', String(params.height))
  }
  if (params?.id) {
    queryParams.append('where[id][equals]', String(params.id))
  }

  return payloadRequest(`/api/media-assets?${queryParams.toString()}`, token)
}
