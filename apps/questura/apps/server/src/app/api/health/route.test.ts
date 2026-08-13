import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

const { find } = vi.hoisted(() => ({ find: vi.fn() }))

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find })),
}))

vi.mock('@/payload.config', () => ({ default: {} }))
vi.mock('@/shared/utils/cors', () => ({
  getCorsHeaders: () => new Headers(),
  handleCorsOptions: () => new Response(null, { status: 204 }),
}))

const { GET } = await import('./route')
const request = { headers: new Headers() } as NextRequest

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.stubEnv('QUESTURA_RELEASE_SHA', '')
    find.mockReset()
    find.mockResolvedValue({ docs: [] })
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
    expect(find).toHaveBeenCalledWith({ collection: 'users', limit: 1, depth: 0 })
  })

  it('retains release identity when the database is unhealthy', async () => {
    vi.stubEnv('QUESTURA_RELEASE_SHA', 'broken-release')
    find.mockRejectedValue(new Error('database unavailable'))

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
})
