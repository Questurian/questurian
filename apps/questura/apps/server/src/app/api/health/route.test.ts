import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ db: { pool: { query } } })),
}))

vi.mock('@/payload.config', () => ({ default: {} }))
vi.mock('@/shared/utils/cors', () => ({
  getCorsHeaders: () => new Headers(),
  handleCorsOptions: () => new Response(null, { status: 204 }),
}))

const { GET } = await import('./route')
const { resetHealthProbe, PROBE_TIMEOUT_MS, PROBE_TTL_MS } = await import('@/shared/observability/health-probe')
const request = { headers: new Headers() } as NextRequest

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.stubEnv('QUESTURA_RELEASE_SHA', '')
    query.mockReset()
    query.mockResolvedValue({ rows: [] })
    // The probe is sampled across requests, so each test starts from no
    // cached answer.
    resetHealthProbe()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports runtime release identity after checking the database', async () => {
    vi.stubEnv('QUESTURA_RELEASE_SHA', 'abc123')

    const response = await GET(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'healthy',
      releaseSha: 'abc123',
      database: { status: 'connected' },
    })
    expect(query).toHaveBeenCalledWith({ text: 'select 1', query_timeout: PROBE_TIMEOUT_MS })
  })

  it('retains release identity when the database is unhealthy', async () => {
    vi.stubEnv('QUESTURA_RELEASE_SHA', 'broken-release')
    query.mockRejectedValue(new Error('database unavailable'))

    const response = await GET(request)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      status: 'unhealthy',
      releaseSha: 'broken-release',
      database: { status: 'disconnected' },
    })
  })

  it('uses an explicit unknown sentinel outside release deployments', async () => {
    const response = await GET(request)
    await expect(response.json()).resolves.toMatchObject({ releaseSha: 'unknown' })
  })

  // The failure this sampling exists to prevent: a platform polling every
  // instance turns a database outage into an outage plus a poll storm, with
  // each check holding a request open for a connection timeout.
  it('does not query the database once per request', async () => {
    await Promise.all([GET(request), GET(request), GET(request), GET(request)])
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('says how old the sampled answer is, so a reader can tell current from recent', async () => {
    const first = await (await GET(request)).json()
    const second = await (await GET(request)).json()

    expect(first.probeAgeMs).toBeLessThanOrEqual(PROBE_TTL_MS)
    expect(second.probeAgeMs).toBeGreaterThanOrEqual(first.probeAgeMs)
  })

  it('never lets a health answer be cached by anything in front of it', async () => {
    const response = await GET(request)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
