import { API_BASE_URL, FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import type { Prompt2BlogSavedArticle } from '../types/articles.types'
import { parseError } from '../../../shared/api/errors/parse-error'

export async function fetchArticles(): Promise<Prompt2BlogSavedArticle[]> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/articles`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog articles')
  }

  return response.json()
}

export async function deleteArticle(runId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/articles/${runId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw await parseError(response, 'Failed to delete Prompt2Blog article')
  }
}
