import type { getPayload } from 'payload'

import type { ArticleTypeKey } from '@/features/articles/public/scope'
import {
  ALL_ARTICLE_TYPES,
  hydrateArticleRefs,
  parseArticleRefs,
  type ArticleRefItem,
  type QueryablePool,
} from '@/features/articles/public/hydrate-refs'

export const ALL_TYPES: ArticleTypeKey[] = ALL_ARTICLE_TYPES

export type { QueryablePool }

export type ArticleSearchHit = {
  type: ArticleTypeKey
  id: number | string
  rank: number
}

export type ArticleSearchItem = ArticleRefItem

export type SearchQueryResult = {
  rows: unknown
  total_count: number | string
}

export function parseHits(value: unknown): ArticleSearchHit[] {
  const rows = typeof value === 'string' ? JSON.parse(value) : value
  const refs = parseArticleRefs(rows)
  const ranks = new Map<string, number>()

  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const hit = row as Record<string, unknown>
      ranks.set(`${String(hit.type)}:${String(hit.id)}`, Number(hit.rank) || 0)
    }
  }

  return refs.map((ref) => ({
    ...ref,
    rank: ranks.get(`${ref.type}:${String(ref.id)}`) ?? 0,
  }))
}

export async function hydrateHits(
  payload: Awaited<ReturnType<typeof getPayload>>,
  hits: ArticleSearchHit[],
) {
  return hydrateArticleRefs(payload, hits)
}
