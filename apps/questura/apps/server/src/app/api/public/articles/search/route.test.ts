import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

/**
 * The finding: search assembled its own corpus per query — body text
 * aggregated out of a dozen block tables per collection and a weighted
 * tsvector built for every published document — so its cost grew with the
 * corpus for every visitor, including the ones who find nothing.
 *
 * What is asserted here is which query the route runs, and that the fallback
 * to the old one is reached only when the index is genuinely empty.
 */
const find = vi.fn()
const query = vi.fn()

vi.mock('payload', () => ({
  getPayload: async () => ({ find, db: { pool: { query } } }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/shared/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const { GET } = await import('./route')

function request(params: Record<string, string>): NextRequest {
  const url = new URL('https://cms.example.test/api/public/articles/search')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return { headers: new Headers(), nextUrl: url } as unknown as NextRequest
}

function sqlOf(callIndex: number): string {
  return String(query.mock.calls[callIndex]?.[0] ?? '')
}

beforeEach(() => {
  find.mockReset()
  query.mockReset()
  find.mockResolvedValue({ docs: [] })
})

describe('GET /api/public/articles/search', () => {
  it('reads the stored search documents', async () => {
    query.mockResolvedValue({
      rows: [{ rows: [{ type: 'articles', id: 4, rank: 9 }], total_count: 1 }],
    })
    find.mockImplementation(async ({ where }: { where: any }) => ({
      docs: (where?.id?.in ?? []).map((id: number) => ({ id, title: `t${id}`, slug: `s${id}` })),
    }))

    const res = await GET(request({ q: 'lima' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.totalDocs).toBe(1)
    expect(sqlOf(0)).toContain('FROM public_search_documents d')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('passes an escaped substring pattern rather than building one in SQL', async () => {
    query.mockResolvedValue({ rows: [{ rows: [], total_count: 3 }] })

    await GET(request({ q: '100%' }))

    expect(query.mock.calls[0]![1]).toEqual(['100%', 'en', 20, 0, '%100\\%%'])
  })

  // An empty index and a corpus with no matches look identical in the result.
  // One of those is a deployment whose backfill has not run.
  it('falls back to the corpus query when the index is empty', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT 1 FROM public_search_documents')) return { rows: [] }
      return { rows: [{ rows: [], total_count: 0 }] }
    })

    const res = await GET(request({ q: 'lima' }))

    expect(res.status).toBe(200)
    expect(sqlOf(0)).toContain('FROM public_search_documents d')
    expect(sqlOf(1)).toContain('SELECT 1 FROM public_search_documents')
    expect(sqlOf(2)).toContain('articles_blocks_text')
  })

  it('does not check the index when the search found something', async () => {
    query.mockResolvedValue({ rows: [{ rows: [], total_count: 5 }] })

    await GET(request({ q: 'lima' }))

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('reports no results rather than falling back when the index is populated', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT 1 FROM public_search_documents')) return { rows: [{ n: 1 }] }
      return { rows: [{ rows: [], total_count: 0 }] }
    })

    const res = await GET(request({ q: 'nothingmatches' }))
    const body = await res.json()

    expect(body.totalDocs).toBe(0)
    expect(query).toHaveBeenCalledTimes(2)
    expect(sqlOf(1)).toContain('SELECT 1 FROM public_search_documents')
  })

  it('rejects a page beyond the result window before querying', async () => {
    const res = await GET(request({ q: 'lima', page: '999999999' }))
    expect(res.status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('still rejects a query that is too short', async () => {
    expect((await GET(request({ q: 'a' }))).status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })
})
