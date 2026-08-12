import { apiFetch } from '../../../shared/api/client/apiFetch'
import { FEATURE_PREFIX } from '../constants/api.constants'
import type {
  ExpandResultResponse,
  ExpandStatusResponse,
  ListicleDetectionResponse,
} from '../types/expansion.types'
import { resolveErrorMessage } from './request-error'

export async function detectArticleListicle(
  runId: string,
  article: string,
  title: string,
  model?: string,
): Promise<ListicleDetectionResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/${runId}/expand/detect`, {
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
  const response = await apiFetch(`${FEATURE_PREFIX}/${runId}/expand`, {
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
  const response = await apiFetch(`${FEATURE_PREFIX}/expand/${expandJobId}/status`)

  if (!response.ok) {
    throw new Error('Expansion status fetch failed')
  }

  return response.json()
}

export async function fetchExpandResult(expandJobId: string): Promise<ExpandResultResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/expand/${expandJobId}/result`)

  if (!response.ok) {
    throw new Error('Expansion result fetch failed')
  }

  return response.json()
}
