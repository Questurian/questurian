import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getHandler = vi.fn()
  const postHandler = vi.fn()
  const patchHandler = vi.fn()
  const putHandler = vi.fn()
  const deleteHandler = vi.fn()

  return {
    getHandler,
    postHandler,
    patchHandler,
    putHandler,
    deleteHandler,
    toNextJsHandler: vi.fn(() => ({
      GET: getHandler,
      POST: postHandler,
      PATCH: patchHandler,
      PUT: putHandler,
      DELETE: deleteHandler,
    })),
  }
})

vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: mocks.toNextJsHandler,
}))

vi.mock('@/features/visitor-auth/lib/better-auth', () => ({
  visitorAuth: {},
}))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    CORS_ORIGINS: ['http://localhost:3000'],
  },
  APP_URLS: {
    frontend: 'http://localhost:3000',
  },
}))

import { GET, OPTIONS, POST } from '@/app/api/visitor-auth/[...all]/route'

function createRequest(method: string) {
  return new Request('http://localhost:4000/api/visitor-auth/sign-in/email', {
    method,
    headers: {
      origin: 'http://localhost:3000',
    },
  }) as any
}

describe('Visitor auth route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getHandler.mockResolvedValue(Response.json({ ok: true }))
    mocks.postHandler.mockResolvedValue(Response.json({ ok: true }))
  })

  it('handles CORS preflight', async () => {
    const response = OPTIONS(createRequest('OPTIONS'))

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('delegates GET requests to Better Auth and preserves credentialed CORS', async () => {
    const response = await GET(createRequest('GET'))

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.getHandler).toHaveBeenCalledOnce()
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('delegates POST requests to Better Auth and preserves credentialed CORS', async () => {
    const response = await POST(createRequest('POST'))

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.postHandler).toHaveBeenCalledOnce()
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('returns CORS headers when Better Auth throws before producing a response', async () => {
    mocks.postHandler.mockRejectedValueOnce(new Error('OAuth provider unavailable'))

    const response = await POST(createRequest('POST'))

    await expect(response.json()).resolves.toEqual({ error: 'Authentication request failed' })
    expect(response.status).toBe(500)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })
})
