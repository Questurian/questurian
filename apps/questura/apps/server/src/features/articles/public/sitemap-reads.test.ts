import { describe, expect, it, vi } from 'vitest'

import { TYPE_TO_COLLECTION } from './scope'
import { AUTHOR_TABLES, authorsWithPublishedContent, readAllPages } from './sitemap-reads'

function pagedFind(total: number) {
  return vi.fn(async (args: Record<string, unknown>) => {
    const page = Number(args.page)
    const limit = Number(args.limit)
    const start = (page - 1) * limit
    const docs = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({ id: start + i }))
    return { docs, hasNextPage: start + limit < total, nextPage: page + 1 }
  })
}

describe('readAllPages', () => {
  // The route stopped at `limit: 5000` per collection and said nothing.
  it('walks every page instead of truncating', async () => {
    const find = pagedFind(2500)
    const rows = await readAllPages(find, { collection: 'articles' }, { pageSize: 1000 })
    expect(rows).toHaveLength(2500)
    expect(find).toHaveBeenCalledTimes(3)
  })

  it('refuses rather than silently returning part of a huge set', async () => {
    await expect(readAllPages(pagedFind(5000), { collection: 'articles' }, { pageSize: 1000, maxRows: 3000 })).rejects.toThrow(
      /passed 3000 rows/,
    )
  })

  it('asks for depth 0 and passes the select through', async () => {
    const find = pagedFind(1)
    await readAllPages(find, { collection: 'articles', select: { slug: true } })
    expect(find.mock.calls[0]![0]).toMatchObject({ depth: 0, select: { slug: true }, page: 1, overrideAccess: true })
  })
})

describe('authorsWithPublishedContent', () => {
  it('answers for every author in one query', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [{ author_id: 3 }, { author_id: '7' }] })) }

    const visible = await authorsWithPublishedContent(pool, ['articles', 'maps', 'itineraries'])

    expect(pool.query).toHaveBeenCalledTimes(1)
    expect([...visible]).toEqual(['3', '7'])
    const sql = pool.query.mock.calls[0]![0] as string
    expect(sql.match(/UNION/g)).toHaveLength(2)
    expect(sql).toContain("status = 'published'")
    // Any language, like hasPublishedAuthorContent.
    expect(sql).not.toContain('language')
  })

  it('names a table for every editorial collection', () => {
    for (const [type, collection] of Object.entries(TYPE_TO_COLLECTION)) {
      expect(AUTHOR_TABLES[type as keyof typeof AUTHOR_TABLES]).toBe(collection.replaceAll('-', '_'))
    }
  })
})
