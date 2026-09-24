import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ db: { pool: { query } } })),
}))
vi.mock('@/payload.config', () => ({ default: {} }))
vi.mock('@/features/refresh-outbox/lifecycle', () => ({
  workerHealth: () => ({ draining: false, runs: 3, claiming: true, lastSuccessAt: '2026-09-22T00:00:00.000Z' }),
}))

const { GET } = await import('./route')
const { markDegraded, markNotReady, markReady, resetReadiness } = await import('@/shared/observability/readiness')
const { PROBE_TIMEOUT_MS, resetHealthProbe } = await import('@/shared/observability/health-probe')

beforeEach(() => {
  resetReadiness()
  resetHealthProbe()
  query.mockReset()
  query.mockResolvedValue({ rows: [{ '?column?': 1 }] })
})

describe('GET /api/health/ready', () => {
  it('refuses traffic until initialisation has succeeded, without asking the database', async () => {
    markNotReady('database unavailable')
    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ ready: false, reason: 'database unavailable', database: null })
    expect(query).not.toHaveBeenCalled()
  })

  it('accepts traffic once the process is ready and the database answers', async () => {
    markReady()
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ready: true, reason: null, database: { reachable: true } })
  })

  it('asks the database the cheapest question there is, under its own short limit', async () => {
    markReady()
    await GET()
    expect(query).toHaveBeenCalledWith({ text: 'select 1', query_timeout: PROBE_TIMEOUT_MS })
  })

  // The gap readiness:faults found: a frozen database, and readiness still
  // saying yes while every request hung.
  it('stops saying ready when the database does not answer', async () => {
    markReady()
    query.mockRejectedValue(new Error('Query read timeout'))
    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      ready: false,
      reason: 'database unreachable',
      database: { reachable: false },
    })
  })

  // A query that never settles must not hold the answer past the probe limit.
  it('answers within the probe limit when the database hangs', async () => {
    vi.useFakeTimers()
    try {
      markReady()
      query.mockReturnValue(new Promise(() => {}))
      const pending = GET()
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1)
      expect((await pending).status).toBe(503)
    } finally {
      vi.useRealTimers()
    }
  })

  // Polled as hard as a platform likes, the database still sees one probe.
  it('does not query the database once per request', async () => {
    markReady()
    await Promise.all([GET(), GET(), GET(), GET()])
    expect(query).toHaveBeenCalledTimes(1)
  })

  // Degraded is a capability statement, not a reason to take the instance
  // out of rotation and leave readers with nothing.
  it('stays ready while reporting a degraded capability', async () => {
    markReady()
    markDegraded('redis')
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ready: true, degraded: ['redis'] })
  })

  it('reports the refresh worker, so a backlog can be told from a stopped worker', async () => {
    markReady()
    await expect((await GET()).json()).resolves.toMatchObject({ refreshWorker: { runs: 3, claiming: true } })
  })

  it('is never stored', async () => {
    markReady()
    expect((await GET()).headers.get('Cache-Control')).toBe('no-store')
  })
})
