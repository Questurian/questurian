import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

const query = vi.fn()

vi.mock('payload', () => ({
  getPayload: async () => ({
    db: { pool: { totalCount: 7, idleCount: 4, waitingCount: 2, query } },
  }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/shared/utils/advisory-lock', () => ({
  advisoryLockPoolStats: () => ({
    open: true,
    total: 1,
    idle: 1,
    waiting: 0,
    max: 10,
    pooledConnection: false,
  }),
}))

const { GET } = await import('./route')

function request(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: new Headers(headers),
    nextUrl: new URL('https://cms.example.test/api/internal/db-stats'),
  } as unknown as NextRequest
}

beforeEach(() => {
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('pg_stat_activity')) {
      return { rows: [{ state: 'active', connections: 3 }, { state: 'idle', connections: 4 }] }
    }
    return { rows: [{ rows: 24, newest: '2026-09-20T12:00:00Z', oldest: '2026-09-01T00:00:00Z' }] }
  })
  vi.stubEnv('DB_STATS_SECRET', 'a-secret')
})

describe('GET /api/internal/db-stats', () => {
  it('refuses without the secret', async () => {
    const res = await GET(request())
    expect(res.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('refuses a wrong secret', async () => {
    const res = await GET(request({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
  })

  it('says so when nothing is configured rather than opening up', async () => {
    vi.stubEnv('DB_STATS_SECRET', '')
    const res = await GET(request({ authorization: 'Bearer a-secret' }))
    expect(res.status).toBe(503)
  })

  it('accepts either header shape', async () => {
    expect((await GET(request({ authorization: 'Bearer a-secret' }))).status).toBe(200)
    expect((await GET(request({ 'x-stats-secret': 'a-secret' }))).status).toBe(200)
  })

  // The audit could not say whether concurrent homepage requests saturated the
  // pool, because nothing reported occupancy. `waiting` is that answer.
  it('reports pool occupancy, the budget and the search index', async () => {
    const res = await GET(request({ authorization: 'Bearer a-secret' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.payloadPool).toEqual({ total: 7, idle: 4, waiting: 2 })
    expect(body.advisoryLockPool.max).toBe(10)
    expect(body.budget.perProcess).toBe(41)
    expect(body.timeouts.serving.statementMs).toBeGreaterThan(0)
    expect(body.backendsByState).toEqual([
      { state: 'active', connections: 3 },
      { state: 'idle', connections: 4 },
    ])
    expect(body.searchIndex.rows).toBe(24)
  })

  it('is never cached', async () => {
    const res = await GET(request({ authorization: 'Bearer a-secret' }))
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('still answers when the search index table is missing', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_stat_activity')) return { rows: [] }
      throw new Error('relation "public_search_documents" does not exist')
    })

    const res = await GET(request({ authorization: 'Bearer a-secret' }))
    expect(res.status).toBe(200)
  })
})
