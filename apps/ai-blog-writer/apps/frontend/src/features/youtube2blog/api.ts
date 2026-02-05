import type { ArticleType, ResultResponse, StatusResponse, UploadResponse } from '@shared/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const CONVERTER_URL = import.meta.env.VITE_CONVERTER_URL || 'http://localhost:4004'
const FEATURE_PREFIX = '/youtube2blog'

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
