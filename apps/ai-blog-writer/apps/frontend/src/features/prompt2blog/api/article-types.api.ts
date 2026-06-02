import { API_BASE_URL } from '../constants/prompt2blog.constants'
import { parseError } from '../../../shared/api/errors/parse-error'
import type {
  ArticleTypeGuidelines,
  ArticleTypeOption,
} from '../types/article-types.types'

export async function fetchArticleTypes(): Promise<ArticleTypeOption[]> {
  const response = await fetch(`${API_BASE_URL}/article-types/name-definitions`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch article types')
  }

  return response.json()
}

export async function fetchArticleTypeGuidelinesById(
  articleTypeId: number,
): Promise<ArticleTypeGuidelines> {
  const response = await fetch(`${API_BASE_URL}/article-types/${articleTypeId}/guidelines`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch article guidelines')
  }

  return response.json()
}
