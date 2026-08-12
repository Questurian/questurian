import { apiFetch } from '../../../shared/api/client/apiFetch'
import { parseError } from '../../../shared/api/errors/parse-error'
import type {
  ArticleTypeGuidelines,
  ArticleTypeOption,
} from '../types/article-types.types'

export async function fetchArticleTypes(): Promise<ArticleTypeOption[]> {
  const response = await apiFetch('/article-types/name-definitions')

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch article types')
  }

  return response.json()
}

export async function fetchArticleTypeGuidelinesById(
  articleTypeId: number,
): Promise<ArticleTypeGuidelines> {
  const response = await apiFetch(`/article-types/${articleTypeId}/guidelines`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch article guidelines')
  }

  return response.json()
}
