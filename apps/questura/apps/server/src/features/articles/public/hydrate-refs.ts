import type { getPayload } from 'payload'

import { TYPE_TO_COLLECTION, type ArticleTypeKey } from './scope'
import {
  INDEX_ITEM_DEPTH,
  INDEX_ITEM_SELECT,
  serializeIndexItem,
  type IndexItem,
} from './indexItem'

export const ALL_ARTICLE_TYPES: ArticleTypeKey[] = ['articles', 'maps', 'itineraries']

/**
 * A pointer at one published document, ordered by whatever produced it.
 *
 * Both search and the location feed decide ordering in SQL over ids alone and
 * only then fetch the cards for the page they are returning. That split is the
 * point: ordering across three collections is cheap on ids and expensive on
 * populated documents, and the old location feed paid the expensive version
 * once per collection for every page before the one asked for.
 */
export type ArticleRef = {
  type: ArticleTypeKey
  id: number | string
}

export type ArticleRefItem = IndexItem & { type: ArticleTypeKey }

/** `{ type, id }` rows as Postgres `json_agg` hands them back. */
export function parseArticleRefs(value: unknown): ArticleRef[] {
  const rows = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(rows)) return []

  return rows.flatMap((row): ArticleRef[] => {
    if (!row || typeof row !== 'object') return []
    const ref = row as Record<string, unknown>
    if (!ALL_ARTICLE_TYPES.includes(ref.type as ArticleTypeKey)) return []
    if (typeof ref.id !== 'number' && typeof ref.id !== 'string') return []

    return [{ type: ref.type as ArticleTypeKey, id: ref.id }]
  })
}

/**
 * Fetch card fields for exactly these refs — one query per collection, ids
 * batched — and return them in the order the refs arrived.
 *
 * Refs whose document has since disappeared are dropped rather than rendered
 * as holes; the count that came with the refs is the authority on totals.
 */
export async function hydrateArticleRefs<TRef extends ArticleRef>(
  payload: Awaited<ReturnType<typeof getPayload>>,
  refs: TRef[],
): Promise<ArticleRefItem[]> {
  const itemsByKey = new Map<string, ArticleRefItem>()

  await Promise.all(
    ALL_ARTICLE_TYPES.map(async (type) => {
      const ids = refs.filter((ref) => ref.type === type).map((ref) => ref.id)
      if (ids.length === 0) return

      const result = await payload.find({
        collection: TYPE_TO_COLLECTION[type],
        where: { id: { in: ids } },
        limit: ids.length,
        depth: INDEX_ITEM_DEPTH,
        select: INDEX_ITEM_SELECT,
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

  return refs
    .map((ref) => itemsByKey.get(`${ref.type}:${String(ref.id)}`))
    .filter((item): item is ArticleRefItem => Boolean(item))
}

/** A `pg`-shaped pool, narrowed to what the public read routes use. */
export type QueryablePool = {
  query: (
    sql: string,
    values: unknown[],
  ) => Promise<{ rows: Array<{ rows: unknown; total_count: number | string }> }>
}
