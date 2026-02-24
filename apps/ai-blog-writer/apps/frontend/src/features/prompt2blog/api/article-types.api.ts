import { API_BASE_URL, FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import { parseError } from '../utils/parse-error'
import type {
  ArticleTypeGuidelines,
  ArticleTypeOption,
  ClassifyResponse,
} from '../types/article-types.types'

export async function fetchArticleTypes(): Promise<ArticleTypeOption[]> {
  const response = await fetch(`${API_BASE_URL}/article-types/name-definitions`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch article types')
  }

  return response.json()
}

export async function classifyArticleType(
  cleanedData: string,
  articleTypes: ArticleTypeOption[],
  writingBrief?: Record<string, unknown>,
): Promise<ClassifyResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cleaned_data: cleanedData,
      article_types: articleTypes,
      writing_brief: writingBrief,
    }),
  })

  if (!response.ok) {
    throw await parseError(response, 'Classification request failed')
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
