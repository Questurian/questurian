import { PAYLOAD_API_URL } from '../../../../shared/api/client/config'
import { apiFetch } from '../../../../shared/api/client/apiFetch'
import { parseErrorResponse } from '../../../../shared/api/client/error-parser'
import type { CreateArticlePayload, PayloadArticleDoc } from './articles.types'

function unwrapPayloadDoc<T>(result: T | { doc?: T }): T {
  if (result && typeof result === 'object' && 'doc' in result && (result as { doc?: T }).doc) {
    return (result as { doc: T }).doc
  }
  return result as T
}

export async function createArticle(
  article: CreateArticlePayload,
  token: string,
): Promise<PayloadArticleDoc> {
  const response = await fetch(`${PAYLOAD_API_URL}/api/articles`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(article),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to create article: ${response.status}`, { message: 'Unknown error' })
    throw new Error(message)
  }

  const result = await response.json()
  return unwrapPayloadDoc<PayloadArticleDoc>(result)
}

export async function updateArticle(
  id: number,
  article: CreateArticlePayload,
  token: string,
): Promise<PayloadArticleDoc> {
  const response = await fetch(`${PAYLOAD_API_URL}/api/articles/${id}`, {
    method: 'PATCH',
    mode: 'cors',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(article),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to update article: ${response.status}`, { message: 'Unknown error' })
    throw new Error(message)
  }

  const result = await response.json()
  return unwrapPayloadDoc<PayloadArticleDoc>(result)
}

export async function getArticleById(
  id: number,
  token: string,
): Promise<PayloadArticleDoc> {
  const response = await fetch(`${PAYLOAD_API_URL}/api/articles/${id}?depth=1`, {
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to fetch article: ${response.status}`, { message: 'Unknown error' })
    throw new Error(message)
  }

  const result = await response.json()
  return unwrapPayloadDoc<PayloadArticleDoc>(result)
}

export async function fetchPayloadArticles(token: string): Promise<PayloadArticleDoc[]> {
  const query = new URLSearchParams({
    limit: '200',
    depth: '0',
    sort: '-updatedAt',
  })
  const response = await fetch(`${PAYLOAD_API_URL}/api/articles?${query.toString()}`, {
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to fetch Payload articles: ${response.status}`, { message: 'Unknown error' })
    throw new Error(message)
  }

  const result = await response.json()
  return Array.isArray(result.docs) ? result.docs : []
}

export function buildPayloadAdminArticleUrl(articleId: number): string {
  return `${PAYLOAD_API_URL}/admin/collections/articles/${articleId}`
}

export async function markArticleSynced(
  featurePrefix: string,
  runId: string,
  payloadArticleId: number,
): Promise<{ message: string; run_id: string; payload_article_id: number }> {
  const response = await apiFetch(
    `${featurePrefix}/articles/${runId}/sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload_article_id: payloadArticleId }),
    },
  )

  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to mark article synced: ${response.status}`, { detail: 'Unknown error' })
    throw new Error(message)
  }

  return response.json()
}

export async function getArticleSyncStatus(
  featurePrefix: string,
  runId: string,
): Promise<{
  synced_to_payload: boolean
  payload_article_id: number | null
  synced_at: string | null
}> {
  const response = await apiFetch(`${featurePrefix}/articles/${runId}/sync`)

  if (!response.ok) {
    throw new Error(`Failed to get sync status: ${response.status}`)
  }

  return response.json()
}
