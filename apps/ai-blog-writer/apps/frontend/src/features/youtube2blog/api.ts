import type { ArticleType, ResultResponse, StatusResponse, UploadResponse } from '@shared/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const CONVERTER_URL = import.meta.env.VITE_CONVERTER_URL || 'http://localhost:4004'
const FEATURE_PREFIX = '/youtube2blog'
const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

export type LexicalConvertResponse = {
  success: boolean
  data?: object
  error?: string
  metadata?: {
    nodeCount: number
    hasContent: boolean
    timestamp: string
  }
}

export async function convertMarkdownToLexical(markdown: string): Promise<LexicalConvertResponse> {
  const response = await fetch(`${CONVERTER_URL}/convert/markdown`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ markdown }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Conversion failed' }))
    return { success: false, error: errorData.error || 'Conversion failed' }
  }

  return response.json()
}

export async function uploadCsv(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/upload`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error('Upload failed')
  }

  return response.json()
}

export async function fetchStatus(runId: string): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status/${runId}`)
  if (!response.ok) {
    throw new Error('Status fetch failed')
  }
  return response.json()
}

export async function fetchResult(runId: string): Promise<ResultResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}`)
  if (!response.ok) {
    throw new Error('Result fetch failed')
  }
  return response.json()
}

export function resultDownloadUrl(runId: string): string {
  return `${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}?format=md`
}

export async function clearDatabase(): Promise<{ message: string; deleted_runs: number }> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/clear`, {
    method: 'POST'
  })
  if (!response.ok) {
    throw new Error('Clear database failed')
  }
  return response.json()
}

export type DebugResponse = {
  run_id: string
  status: Record<string, unknown>
  stages: Record<string, unknown>
  output: Record<string, unknown> | null
}

export async function fetchDebug(runId: string): Promise<DebugResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/debug/${runId}`)
  if (!response.ok) {
    throw new Error('Debug fetch failed')
  }
  return response.json()
}

export type SavedArticle = {
  run_id: string
  title: string | null
  article_type: string | null
  created_at: string
  updated_at: string
  markdown: string
  markdown_length: number
}

export async function fetchArticles(): Promise<SavedArticle[]> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/articles`)
  if (!response.ok) {
    throw new Error('Failed to fetch articles')
  }
  return response.json()
}

export async function fetchArticleTypes(): Promise<ArticleType[]> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/article-types`)
  if (!response.ok) {
    throw new Error('Failed to fetch article types')
  }
  return response.json()
}

export async function createArticleType(name: string, definition: string): Promise<ArticleType> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/article-types`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, definition }),
  })
  if (!response.ok) {
    throw new Error('Failed to create article type')
  }
  return response.json()
}

export async function updateArticleType(id: number, name: string, definition: string): Promise<ArticleType> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/article-types/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, definition }),
  })
  if (!response.ok) {
    throw new Error('Failed to update article type')
  }
  return response.json()
}

export async function deleteArticleType(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/article-types/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete article type')
  }
}

// ============================================================================
// Questura Payload CMS API - Locations, Categories, Tags
// ============================================================================

export type Location = {
  id: number
  level: 'country' | 'city' | 'neighborhood'
  country: string
  city?: string | null
  neighborhood?: string | null
  countryName?: string
  cityName?: string
  neighborhoodName?: string
  locationKey: string
  parentKey?: string | null
  updatedAt: string
  createdAt: string
}

export type ArticleCategory = {
  id: number
  name: string
  slug?: string
  description?: string
  usageCount?: number
  status?: 'active' | 'archived'
  updatedAt: string
  createdAt: string
}

export type ArticleTag = {
  id: number
  name: string
  slug?: string
  displayName?: string
  description?: string
  usageCount?: number
  status?: 'active' | 'archived'
  updatedAt: string
  createdAt: string
}

export type MediaAsset = {
  id: number
  filename: string
  alt?: string
  url?: string
  mimeType?: string
  filesize?: number
  width?: number
  height?: number
}

async function payloadRequest(endpoint: string, token?: string) {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    headers,
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch from ${endpoint}: ${response.status}`)
  }
  
  return response.json()
}

export async function fetchLocations(token?: string, params?: { 
  limit?: number 
  page?: number
}): Promise<{ docs: Location[]; totalDocs: number; totalPages: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.page) queryParams.append('page', String(params.page))
  
  return payloadRequest(`/api/locations?${queryParams.toString()}`, token)
}

export async function fetchArticleCategories(token?: string, params?: {
  limit?: number
  status?: string
}): Promise<{ docs: ArticleCategory[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.status) queryParams.append('where[status][equals]', params.status)
  
  return payloadRequest(`/api/article-categories?${queryParams.toString()}`, token)
}

export async function fetchArticleTags(token?: string, params?: {
  limit?: number
  status?: string
}): Promise<{ docs: ArticleTag[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.status) queryParams.append('where[status][equals]', params.status)
  
  return payloadRequest(`/api/article-tags?${queryParams.toString()}`, token)
}

export async function fetchMediaAssets(token?: string, params?: {
  limit?: number
  mimeType?: string
}): Promise<{ docs: MediaAsset[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 50))
  if (params?.mimeType) queryParams.append('where[mimeType][like]', params.mimeType)
  
  return payloadRequest(`/api/media-assets?${queryParams.toString()}`, token)
}

// ============================================================================
// Article Creation API
// ============================================================================

export type CreateArticlePayload = {
  title: string
  location?: string
  locationRef?: number
  step1_complete: boolean
  status?: 'draft' | 'published'
  category?: number
  tags?: number[]
  headerSection?: {
    featuredImage?: number
    intro?: object // Lexical JSON
  }
  contentBlocks?: Array<{
    blockType: 'text' | 'image'
    content?: object // For text blocks
    image?: number // For image blocks
    altText?: string
    caption?: string
  }>
  seoSection?: {
    seo?: number
  }
}

export async function createArticle(
  article: CreateArticlePayload,
  token: string
): Promise<{ id: number; title: string; slug: string }> {
  const response = await fetch(`${PAYLOAD_API_URL}/api/articles`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(article),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(errorData.message || `Failed to create article: ${response.status}`)
  }

  // Payload CMS wraps responses in a 'doc' object
  const result = await response.json()
  return result.doc
}

// ============================================================================
// Article Sync Status API
// ============================================================================

export async function markArticleSynced(
  runId: string,
  payloadArticleId: number
): Promise<{ message: string; run_id: string; payload_article_id: number }> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/articles/${runId}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payload_article_id: payloadArticleId }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(errorData.detail || `Failed to mark article synced: ${response.status}`)
  }

  return response.json()
}

export async function getArticleSyncStatus(
  runId: string
): Promise<{ synced_to_payload: boolean; payload_article_id: number | null; synced_at: string | null }> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/articles/${runId}/sync`)

  if (!response.ok) {
    throw new Error(`Failed to get sync status: ${response.status}`)
  }

  return response.json()
}
