import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/refresh-outbox/lifecycle', () => ({
  workerHealth: () => ({ draining: false, runs: 3, claiming: true, lastSuccessAt: '2026-09-22T00:00:00.000Z' }),
}))

const { GET } = await import('./route')
const { markDegraded, markNotReady, markReady, resetReadiness } = await import('@/shared/observability/readiness')

beforeEach(() => {
  resetReadiness()
})

/**
 * Readiness has to be free to ask. `/api/health` runs a database query, so a
 * platform polling it across every instance turns a database outage into an
 * outage plus a poll storm. This route reads process state and touches
 * nothing.
 */
describe('GET /api/health/ready', () => {
  it('refuses traffic until initialisation has succeeded', async () => {
    markNotReady('database unavailable')
    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ ready: false, reason: 'database unavailable' })
  })

  it('accepts traffic once the process is ready', async () => {
    markReady()
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ready: true, reason: null })
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
