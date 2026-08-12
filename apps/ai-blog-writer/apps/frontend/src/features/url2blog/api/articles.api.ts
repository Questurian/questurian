import { apiFetch } from '../../../shared/api/client/apiFetch'
import { FEATURE_PREFIX } from '../constants/url2blog.constants'
import type { Url2BlogSavedArticle } from '../types/articles.types'
import { resolveErrorMessage } from './request-error'

export async function fetchArticles(): Promise<Url2BlogSavedArticle[]> {
  const response = await apiFetch(`${FEATURE_PREFIX}/articles`)
  if (!response.ok) {
    throw new Error('Failed to fetch URL2Blog articles')
  }
  return response.json()
}

export async function deleteArticle(runId: string): Promise<void> {
  const response = await apiFetch(`${FEATURE_PREFIX}/articles/${runId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'Failed to delete URL2Blog article'))
  }
}
