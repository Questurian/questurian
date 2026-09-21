import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

/**
 * The route is the unit: Payload and the pool are stubbed, so what is asserted
 * is which reads the route issues and with what bounds.
 *
 * The finding this covers: the route used to ask each of three collections for
 * `page * pageSize` populated documents and slice one page out in memory, so
 * page 100 of 50 fetched up to 15,000 documents to return 50. Ordering is now
 * a single id-only query and only the page's ids are hydrated.
 */
const find = vi.fn()
const query = vi.fn()

vi.mock('payload', () => ({
  getPayload: async () => ({ find, db: { pool: { query } } }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/shared/location/server/publicLocationLabel', () => ({
  publicLocationLabel: () => 'Lima',
}))

const { GET } = await import('./route')

function request(query: Record<string, string>): NextRequest {
  const url = new URL('https://cms.example.test/api/public/articles/by-location')
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return { headers: new Headers(), nextUrl: url } as unknown as NextRequest
}

function locationFound() {
  find.mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === 'locations') {
      return { docs: [{ id: 1, level: 'city', locationKey: 'peru|lima' }] }
    }
    return { docs: [] }
  })
}

beforeEach(() => {
  find.mockReset()
  query.mockReset()
  locationFound()
  query.mockResolvedValue({ rows: [{ rows: [], total_count: 0 }] })
})

describe('GET /api/public/articles/by-location', () => {
  it('rejects a malformed location key before touching the database', async () => {
    const res = await GET(request({ key: 'Peru/Lima' }))
    expect(res.status).toBe(400)
    expect(find).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects a page beyond the result window before touching the database', async () => {
    const res = await GET(request({ key: 'peru|lima', page: '999999999' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: expect.stringContaining('result window') })
    expect(find).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects a page that is not a whole number', async () => {
    expect((await GET(request({ key: 'peru|lima', page: '2.5' }))).status).toBe(400)
    expect((await GET(request({ key: 'peru|lima', page: 'abc' }))).status).toBe(400)
  })

  it('asks the database for one page of ids, not page * pageSize documents', async () => {
    await GET(request({ key: 'peru|lima', page: '100', pageSize: '50' }))

    expect(query).toHaveBeenCalledTimes(1)
    const [, values] = query.mock.calls[0]
    expect(values).toEqual(['peru|lima', 'peru|lima|%', 'en', 50, 4950])
  })

  it('hydrates only the ids on the page, one query per collection', async () => {
    query.mockResolvedValue({
      rows: [{
        rows: [
          { type: 'articles', id: 7 },
          { type: 'maps', id: 3 },
          { type: 'articles', id: 4 },
        ],
        total_count: 41,
      }],
    })
    find.mockImplementation(async ({ collection, where }: { collection: string; where: any }) => {
      if (collection === 'locations') {
        return { docs: [{ id: 1, level: 'city', locationKey: 'peru|lima' }] }
      }
      const ids: number[] = where?.id?.in ?? []
      return { docs: ids.map((id) => ({ id, title: `t${id}`, slug: `s${id}` })) }
    })

    const res = await GET(request({ key: 'peru|lima', pageSize: '20' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.totalDocs).toBe(41)
    expect(body.totalPages).toBe(3)
    expect(body.hasNext).toBe(true)

    // One location lookup + one find per collection that actually has ids.
    const contentFinds = find.mock.calls.filter(([args]) => args.collection !== 'locations')
    expect(contentFinds).toHaveLength(2)
    for (const [args] of contentFinds) {
      expect(args.limit).toBe(args.where.id.in.length)
      expect(args.select).toBeDefined()
    }

    // SQL order is the contract; hydration must not reshuffle it.
    expect(body.items.map((item: { id: number }) => item.id)).toEqual([7, 3, 4])
  })

  it('404s an unknown location without running the feed query', async () => {
    find.mockResolvedValue({ docs: [] })
    const res = await GET(request({ key: 'peru|nowhere' }))
    expect(res.status).toBe(404)
    expect(query).not.toHaveBeenCalled()
  })
})
