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

export async function startFromYoutubeUrl(
  url: string,
  model?: string,
  forcedArticleType?: string,
): Promise<UploadResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/from-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      ...(model ? { model } : {}),
      ...(forcedArticleType?.trim() ? { forced_article_type: forcedArticleType.trim() } : {}),
    }),
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

export type ListicleDetectionResponse = {
  is_listicle: boolean
  list_type: string | null
  list_topic: string | null
  detected_items: string[]
}

export type ExpandGap = {
  type: string
  topic: string
  reason: string
  suggested_section_title: string
}

export type ExpandStatusResponse = {
  run_id: string
  state: 'running' | 'completed' | 'failed'
  stage: 'analyzing' | 'expanding' | 'completed' | 'error'
  updated_at: string
  error?: string | null
}

export type ExpandResultResponse = {
  expanded_article: string
  gaps: ExpandGap[]
  expansion_plan: string
}

export async function detectArticleListicle(
  runId: string,
  article: string,
  title: string,
  model?: string,
): Promise<ListicleDetectionResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/${runId}/expand/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article, title, ...(model ? { model } : {}) }),
  })

  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'Failed to detect article type'))
  }

  return response.json()
}

export async function startArticleExpansion(
  runId: string,
  article: string,
  articleType: string,
  title: string,
  model?: string,
  rewriteItems?: string[],
): Promise<{ expand_job_id: string }> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/${runId}/expand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      article,
      article_type: articleType,
      title,
      ...(model ? { model } : {}),
      ...(rewriteItems && rewriteItems.length > 0 ? { rewrite_items: rewriteItems } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'Failed to start article expansion'))
  }

  return response.json()
}

export async function fetchExpandStatus(expandJobId: string): Promise<ExpandStatusResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/expand/${expandJobId}/status`)

  if (!response.ok) {
    throw new Error('Expansion status fetch failed')
  }

  return response.json()
}

export async function fetchExpandResult(expandJobId: string): Promise<ExpandResultResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/expand/${expandJobId}/result`)

  if (!response.ok) {
    throw new Error('Expansion result fetch failed')
  }

  return response.json()
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
