import type { ArticleType } from '@shared/types'
import { apiFetch } from '../../../shared/api/client/apiFetch'
import { ARTICLE_TYPES_PREFIX } from '../constants/api.constants'

export async function fetchArticleTypes(): Promise<ArticleType[]> {
  const response = await apiFetch(ARTICLE_TYPES_PREFIX)

  if (!response.ok) {
    throw new Error('Failed to fetch article types')
  }

  return response.json()
}

export async function createArticleType(name: string, definition: string): Promise<ArticleType> {
  const response = await apiFetch(ARTICLE_TYPES_PREFIX, {
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
  definition: string,
): Promise<ArticleType> {
  const response = await apiFetch(`${ARTICLE_TYPES_PREFIX}/${id}`, {
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
  const response = await apiFetch(`${ARTICLE_TYPES_PREFIX}/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Failed to delete article type')
  }
}
