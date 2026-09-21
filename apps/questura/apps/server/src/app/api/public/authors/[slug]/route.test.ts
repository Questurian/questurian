import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

/**
 * The finding: the author page asked each of three collections for up to 100
 * documents at depth 2 with no `select`, so a prolific author cost up to 300
 * fully populated documents — listicle bodies and venue relations included —
 * to render summary cards that read eight fields.
 */
const find = vi.fn()
const findByID = vi.fn()
const count = vi.fn()
const query = vi.fn()

vi.mock('payload', () => ({
  getPayload: async () => ({ find, findByID, count, db: { pool: { query } } }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

const { GET } = await import('./route')

function request(slug: string, params: Record<string, string> = {}) {
  const url = new URL(`https://cms.example.test/api/public/authors/${slug}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return {
    req: { headers: new Headers(), nextUrl: url } as unknown as NextRequest,
    ctx: { params: Promise.resolve({ slug }) },
  }
}

beforeEach(() => {
  find.mockReset()
  findByID.mockReset()
  count.mockReset()
  query.mockReset()

  find.mockImplementation(async ({ collection, where }: { collection: string; where: any }) => {
    if (collection === 'authors') {
      return { docs: [{ id: 9, slug: 'ana', displayName: 'Ana', avatar: null }] }
    }
    const ids: number[] = where?.id?.in ?? []
    return { docs: ids.map((id) => ({ id, title: `t${id}`, slug: `s${id}` })) }
  })
  count.mockResolvedValue({ totalDocs: 1 })
  query.mockResolvedValue({ rows: [{ rows: [], total_count: 0 }] })
})

describe('GET /api/public/authors/[slug]', () => {
  it('orders the feed in SQL and hydrates only the page', async () => {
    query.mockResolvedValue({
      rows: [{
        rows: [
          { type: 'itineraries', id: 2 },
          { type: 'articles', id: 5 },
        ],
        total_count: 2,
      }],
    })

    const { req, ctx } = request('ana')
    const res = await GET(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.totalDocs).toBe(2)
    expect(body.articles.map((a: { id: number }) => a.id)).toEqual([2, 5])

    const contentFinds = find.mock.calls.filter(([args]) => args.collection !== 'authors')
    expect(contentFinds).toHaveLength(2)
    for (const [args] of contentFinds) {
      // The whole point: card fields only, and no more documents than ids.
      expect(args.select).toBeDefined()
      expect(args.limit).toBe(args.where.id.in.length)
    }
  })

  it('bounds the page size at 100 however large the caller asks', async () => {
    const { req, ctx } = request('ana', { pageSize: '5000' })
    await GET(req, ctx)
    const [, values] = query.mock.calls[0]
    expect(values).toEqual([9, 'en', 100, 0])
  })

  it('rejects a page beyond the result window', async () => {
    const { req, ctx } = request('ana', { page: '999999' })
    const res = await GET(req, ctx)
    expect(res.status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('404s an author with no published work without running the feed query', async () => {
    count.mockResolvedValue({ totalDocs: 0 })
    const { req, ctx } = request('ana')
    const res = await GET(req, ctx)
    expect(res.status).toBe(404)
    expect(query).not.toHaveBeenCalled()
  })
})
