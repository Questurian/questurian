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
    trustedProxy: { name: 'cloudflare', header: 'cf-connecting-ip' },
  },
  APP_URLS: {
    frontend: 'http://localhost:3000',
  },
}))

import { GET, OPTIONS, POST } from '@/app/api/visitor-auth/[...all]/route'
import { admissionGate, resetAdmissionGates } from '@/shared/http/admission'

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
    vi.unstubAllEnvs()
    resetAdmissionGates()
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

  // Better Auth counts callers by `x-questura-client-ip`. The route writes it
  // from the proxy header on every request, so a caller cannot choose it, and
  // it is always an address — never absent, which would make Better Auth skip
  // its limiter in production.
  describe('client identity handed to Better Auth', () => {
    async function identitySeenBy(headers: Record<string, string>) {
      await POST(
        new Request('http://localhost:4000/api/visitor-auth/sign-in/email', {
          method: 'POST',
          headers: { origin: 'http://localhost:3000', ...headers },
          body: JSON.stringify({ email: 'reader@example.com', password: 'x' }),
        }) as any,
      )
      const request = mocks.postHandler.mock.calls[0]![0] as Request
      return { identity: request.headers.get('x-questura-client-ip'), request }
    }

    it('is the proxy-reported address', async () => {
      const { identity } = await identitySeenBy({ 'cf-connecting-ip': '192.0.2.9' })
      expect(identity).toBe('192.0.2.9')
    })

    it('overwrites a value the caller sent', async () => {
      const { identity } = await identitySeenBy({
        'cf-connecting-ip': '192.0.2.9',
        'x-questura-client-ip': '203.0.113.1',
      })
      expect(identity).toBe('192.0.2.9')
    })

    it('is one address per IPv6 /64', async () => {
      const { identity } = await identitySeenBy({ 'cf-connecting-ip': '2001:db8:1:2::77' })
      expect(identity).toBe('2001:db8:1:2::')
    })

    it.each([
      ['no proxy header', {}],
      ['a junk proxy header', { 'cf-connecting-ip': 'not-an-ip' }],
      ['only a forged x-forwarded-for', { 'x-forwarded-for': '203.0.113.5' }],
      ['a forged identity and no proxy header', { 'x-questura-client-ip': '203.0.113.6' }],
    ])('is the shared unidentified address with %s', async (_label, headers) => {
      const { identity } = await identitySeenBy(headers)
      expect(identity).toBe('0.0.0.0')
    })

    it('keeps the request body and cookies intact', async () => {
      const { request } = await identitySeenBy({
        'cf-connecting-ip': '192.0.2.9',
        cookie: 'questura_visitor.session_token=abc',
      })
      await expect(request.json()).resolves.toEqual({ email: 'reader@example.com', password: 'x' })
      expect(request.headers.get('cookie')).toBe('questura_visitor.session_token=abc')
      expect(request.method).toBe('POST')
      expect(new URL(request.url).pathname).toBe('/api/visitor-auth/sign-in/email')
    })
  })

  // Better Auth limits requests per address and path; nothing bounded how many
  // password hashes ran at once. The `auth` gate does, and its refusal keeps
  // the credentialed CORS headers and is never cacheable.
  it('runs sign-in inside the auth gate and refuses past its queue', async () => {
    vi.stubEnv('VISITOR_AUTH_CONCURRENCY', '1')
    vi.stubEnv('VISITOR_AUTH_QUEUE', '0')
    resetAdmissionGates()
    let release!: () => void
    mocks.postHandler.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(Response.json({ ok: true }))
        }),
    )

    const first = POST(createRequest('POST'))
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(admissionGate('auth').stats().active).toBe(1)

    const refused = await POST(createRequest('POST'))
    expect(refused.status).toBe(503)
    expect(refused.headers.get('x-questura-overload')).toBe('auth; queue-full')
    expect(refused.headers.get('cache-control')).toBe('no-store')
    expect(refused.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(mocks.postHandler).toHaveBeenCalledTimes(1)

    release()
    expect((await first).status).toBe(200)
    expect(admissionGate('auth').stats().active).toBe(0)
  })
})
