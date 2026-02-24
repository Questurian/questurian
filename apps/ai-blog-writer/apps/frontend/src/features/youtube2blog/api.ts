import type { ArticleType, ResultResponse, StatusResponse, UploadResponse } from '@shared/types'
import {
  getArticleSyncStatus as getArticleSyncStatusForFeature,
  markArticleSynced as markArticleSyncedForFeature,
} from '../staging/api'

export {
  convertMarkdownToLexical,
  createArticle,
  fetchArticleCategories,
  fetchArticleTags,
  fetchExternalImageSource,
  fetchLocations,
  fetchMediaAssets,
  importExternalImage,
  searchPexelsImages,
  searchUnsplashImages,
  rewriteBlockWithAi,
} from '../staging/api'

export type {
  ArticleCategory,
  ArticleTag,
  CreateArticlePayload,
  LexicalConvertResponse,
  Location,
  MediaAsset,
  PexelsPhoto,
  PexelsSearchResponse,
  UnsplashPhoto,
  UnsplashSearchResponse,
  RewriteBlockWithAiResponse,
} from '../staging/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const FEATURE_PREFIX = '/youtube2blog'
const ARTICLE_TYPES_PREFIX = '/article-types'

function formatDetail(detail: unknown): string | null {
  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const items = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') {
          return item.msg
        }
        return null
      })
      .filter((item): item is string => Boolean(item))
    return items.length > 0 ? items.join('; ') : null
  }

  return null
}

async function resolveErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json()
    const detail = formatDetail(payload?.detail)
    return detail || fallback
  } catch {
    return fallback
  }
}

export async function startFromYoutubeUrl(url: string): Promise<UploadResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/from-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'Failed to start YouTube URL run'))
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

export async function clearDatabase(): Promise<{
  message: string
  deleted_runs: number
}> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/clear`, {
    method: 'POST',
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
  const response = await fetch(`${API_BASE_URL}${ARTICLE_TYPES_PREFIX}`)

  if (!response.ok) {
    throw new Error('Failed to fetch article types')
  }

  return response.json()
}

export async function createArticleType(
  name: string,
  definition: string
): Promise<ArticleType> {
  const response = await fetch(`${API_BASE_URL}${ARTICLE_TYPES_PREFIX}`, {
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

export async function updateArticleType(
  id: number,
  name: string,
  definition: string
): Promise<ArticleType> {
  const response = await fetch(`${API_BASE_URL}${ARTICLE_TYPES_PREFIX}/${id}`, {
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
  const response = await fetch(`${API_BASE_URL}${ARTICLE_TYPES_PREFIX}/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Failed to delete article type')
  }
}

export async function markArticleSynced(
  runId: string,
  payloadArticleId: number
): Promise<{ message: string; run_id: string; payload_article_id: number }> {
  return markArticleSyncedForFeature(FEATURE_PREFIX, runId, payloadArticleId)
}

export async function getArticleSyncStatus(runId: string): Promise<{
  synced_to_payload: boolean
  payload_article_id: number | null
  synced_at: string | null
}> {
  return getArticleSyncStatusForFeature(FEATURE_PREFIX, runId)
}
