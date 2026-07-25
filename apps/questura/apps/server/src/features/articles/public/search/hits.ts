import type { getPayload } from 'payload'

import { TYPE_TO_COLLECTION, type ArticleTypeKey } from '@/features/articles/public/scope'
import { serializeIndexItem, type IndexItem } from '@/features/articles/public/indexItem'

export const ALL_TYPES: ArticleTypeKey[] = ['articles', 'maps', 'itineraries']

export type ArticleSearchHit = {
  type: ArticleTypeKey
  id: number | string
  rank: number
}

export type ArticleSearchItem = IndexItem & { type: ArticleTypeKey }

export type SearchQueryResult = {
  rows: unknown
  total_count: number | string
}

export type QueryablePool = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: SearchQueryResult[] }>
}

export function parseHits(value: unknown): ArticleSearchHit[] {
  const rows = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(rows)) return []

  return rows.flatMap((row): ArticleSearchHit[] => {
    if (!row || typeof row !== 'object') return []
    const hit = row as Record<string, unknown>
    if (!ALL_TYPES.includes(hit.type as ArticleTypeKey)) return []
    if (typeof hit.id !== 'number' && typeof hit.id !== 'string') return []

    return [{
      type: hit.type as ArticleTypeKey,
      id: hit.id,
      rank: Number(hit.rank) || 0,
    }]
  })
}

export async function hydrateHits(payload: Awaited<ReturnType<typeof getPayload>>, hits: ArticleSearchHit[]) {
  const itemsByKey = new Map<string, ArticleSearchItem>()

  await Promise.all(
    ALL_TYPES.map(async (type) => {
      const ids = hits.filter((hit) => hit.type === type).map((hit) => hit.id)
      if (ids.length === 0) return

      const result = await payload.find({
        collection: TYPE_TO_COLLECTION[type],
        where: { id: { in: ids } },
        limit: ids.length,
        depth: 1,
        overrideAccess: true,
      })

      for (const doc of result.docs) {
        const id = (doc as unknown as Record<string, unknown>).id
        itemsByKey.set(`${type}:${String(id)}`, {
          ...serializeIndexItem(doc, type),
          type,
        })
      }
    }),
  )

  return hits
    .map((hit) => itemsByKey.get(`${hit.type}:${String(hit.id)}`))
    .filter((item): item is ArticleSearchItem => Boolean(item))
}
