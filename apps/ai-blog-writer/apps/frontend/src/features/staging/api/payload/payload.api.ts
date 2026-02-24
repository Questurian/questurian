import { payloadRequest } from '../client/http'
import type { ArticleCategory, ArticleTag, Location, MediaAsset } from './payload.types'

export async function fetchLocations(
  token?: string,
  params?: {
    limit?: number
    page?: number
  },
): Promise<{ docs: Location[]; totalDocs: number; totalPages: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.page) queryParams.append('page', String(params.page))

  return payloadRequest(`/api/locations?${queryParams.toString()}`, token)
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
    minWidth?: number
    minHeight?: number
    width?: number
    height?: number
  },
): Promise<{ docs: MediaAsset[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 50))
  if (params?.mimeType) queryParams.append('where[mimeType][like]', params.mimeType)
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

  return payloadRequest(`/api/media-assets?${queryParams.toString()}`, token)
}
