import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

/**
 * The route is the unit under test, so Payload, auth and the block serializer
 * are all stubbed. What matters here is the order of the checks and what comes
 * back when one of them says no -- a paywall is only as good as its refusals.
 */
const requireVisitorPrincipal = vi.fn()
const find = vi.fn()
const serializeArticleByCollection = vi.fn(async () => undefined)
const checkArticlesFullRateLimit = vi.fn()

vi.mock('@/features/visitor-auth/lib/current-principal', () => ({
  get requireVisitorPrincipal() {
    return requireVisitorPrincipal
  },
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ find }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/features/articles/public/serializeArticleBlocks', () => ({
  get serializeArticleByCollection() {
    return serializeArticleByCollection
  },
}))

vi.mock('@/shared/utils/logger', () => ({
  logger: { error: vi.fn() },
}))

vi.mock('@/features/articles/public/articles-full-rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/articles/public/articles-full-rate-limit')>()
  return {
    ...actual,
    get checkArticlesFullRateLimit() {
      return checkArticlesFullRateLimit
    },
  }
})

const sessionTraffic = vi.fn(async () => ({ allowed: true }) as const)
vi.mock('@/features/visitor-auth/lib/session-traffic-limit', () => ({
  get checkSessionTrafficLimit() {
    return sessionTraffic
  },
}))

const { GET } = await import('./route')
const { admissionGate, resetAdmissionGates } = await import('@/shared/http/admission')

/** A signed-in browser on the site's own origin, unless a test says otherwise. */
const SIGNED_IN = { origin: 'http://localhost:3000', cookie: 'questura_visitor.session_token=abc' }

function request(query: Record<string, string>, headers: Record<string, string> = SIGNED_IN): NextRequest {
  const url = new URL('https://cms.example.test/api/public/articles/full')
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

  return {
    headers: new Headers(headers),
    nextUrl: url,
  } as unknown as NextRequest
}

function entitled(active: boolean) {
  return {
    error: null,
    status: 200,
    principal: { membership: { active } },
  }
}

const GATED_DOC = { id: 42, access: 'member', contentBlocks: [1, 2, 3, 4, 5] }

beforeEach(() => {
  vi.clearAllMocks()
  resetAdmissionGates()
  find.mockResolvedValue({ totalDocs: 1, docs: [{ ...GATED_DOC }] })
  requireVisitorPrincipal.mockResolvedValue(entitled(true))
  checkArticlesFullRateLimit.mockResolvedValue({ allowed: true })
})

describe('GET /api/public/articles/full — refusals', () => {
  it('rejects an unknown type before touching auth or the database', async () => {
    const res = await GET(request({ type: 'novels', id: '42' }))

    expect(res.status).toBe(400)
    expect(requireVisitorPrincipal).not.toHaveBeenCalled()
    expect(find).not.toHaveBeenCalled()
  })

  it('requires an id', async () => {
    const res = await GET(request({ type: 'articles' }))
    expect(res.status).toBe(400)
  })

  it('rejects an unsupported lang', async () => {
    const res = await GET(request({ type: 'articles', id: '42', lang: 'xx' }))
    expect(res.status).toBe(400)
  })

  it('401s an anonymous reader without querying the database', async () => {
    requireVisitorPrincipal.mockResolvedValue({
      error: 'Authentication required',
      status: 401,
      principal: null,
    })

    const res = await GET(request({ type: 'articles', id: '42' }))

    expect(res.status).toBe(401)
    expect(find).not.toHaveBeenCalled()
  })

  it('401s a caller with no session cookie before the limiter, the lookup or the database', async () => {
    const res = await GET(request({ type: 'articles', id: '42' }, { origin: 'http://localhost:3000' }))

    expect(res.status).toBe(401)
    expect(checkArticlesFullRateLimit).not.toHaveBeenCalled()
    expect(requireVisitorPrincipal).not.toHaveBeenCalled()
    expect(find).not.toHaveBeenCalled()
  })

  // A session revoked on another device (password change or reset) must stop
  // reading paid bodies at once, not after the five-minute cookie cache.
  it('checks the session store, not the cookie cache', async () => {
    await GET(request({ type: 'articles', id: '42' }))

    expect(requireVisitorPrincipal).toHaveBeenCalledWith(expect.any(Headers), { freshSession: true })
  })

  it('403s an authenticated reader with no active membership', async () => {
    requireVisitorPrincipal.mockResolvedValue(entitled(false))

    const res = await GET(request({ type: 'articles', id: '42' }))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ message: 'Membership required' })
    expect(find).not.toHaveBeenCalled()
  })

  it('does not require a verified email', async () => {
    // Checkout does not require verification either. Gating the read while
    // checkout stays open would let someone pay and then be refused.
    await GET(request({ type: 'articles', id: '42' }))

    expect(requireVisitorPrincipal).toHaveBeenCalledOnce()
    const options = requireVisitorPrincipal.mock.calls[0][1]
    expect(options?.requireVerified).toBeFalsy()
  })

  it('404s a free article rather than serving it here', async () => {
    find.mockResolvedValue({ totalDocs: 1, docs: [{ id: 7, access: 'free' }] })

    const res = await GET(request({ type: 'articles', id: '7' }))

    expect(res.status).toBe(404)
    expect(serializeArticleByCollection).not.toHaveBeenCalled()
  })

  it('404s when nothing matches', async () => {
    find.mockResolvedValue({ totalDocs: 0, docs: [] })

    const res = await GET(request({ type: 'articles', id: '999' }))
    expect(res.status).toBe(404)
  })

  it('rejects a cookie session from an untrusted origin before resolving the visitor', async () => {
    const res = await GET(
      request(
        { type: 'articles', id: '42' },
        { origin: 'https://evil.example', cookie: 'questura_visitor.session_token=abc' },
      ),
    )

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Origin not allowed.' })
    expect(requireVisitorPrincipal).not.toHaveBeenCalled()
    expect(find).not.toHaveBeenCalled()
  })

  it('rejects a cookie session carrying no origin at all', async () => {
    const res = await GET(
      request({ type: 'articles', id: '42' }, { cookie: 'questura_visitor.session_token=abc' }),
    )

    expect(res.status).toBe(403)
    expect(requireVisitorPrincipal).not.toHaveBeenCalled()
  })

  it('429s before touching auth when the caller is over the rate limit', async () => {
    checkArticlesFullRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 })

    const res = await GET(request({ type: 'articles', id: '42' }))

    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('17')
    expect(requireVisitorPrincipal).not.toHaveBeenCalled()
    expect(find).not.toHaveBeenCalled()
  })

  // Fail closed, but say it was an outage: 503, not "you asked too often".
  it('503s without touching auth when the limiter is unavailable', async () => {
    checkArticlesFullRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 5, unavailable: true })

    const res = await GET(request({ type: 'articles', id: '42' }))

    expect(res.status).toBe(503)
    expect(res.headers.get('x-questura-unavailable')).toBe('counter-unavailable')
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(requireVisitorPrincipal).not.toHaveBeenCalled()
  })

  it('holds the private gate for the whole read, and refuses past its queue', async () => {
    vi.stubEnv('PRIVATE_READ_CONCURRENCY', '1')
    vi.stubEnv('PRIVATE_READ_QUEUE', '0')
    resetAdmissionGates()
    let release!: () => void
    find.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ totalDocs: 1, docs: [{ ...GATED_DOC }] })
        }),
    )

    const first = GET(request({ type: 'articles', id: '42' }))
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(admissionGate('private').stats().active).toBe(1)

    const refused = await GET(request({ type: 'articles', id: '42' }))
    expect(refused.status).toBe(503)
    expect(refused.headers.get('x-questura-overload')).toBe('private; queue-full')
    expect(refused.headers.get('cache-control')).toContain('no-store')
    expect(refused.headers.get('vary')).toContain('Cookie')

    release()
    expect((await first).status).toBe(200)
    expect(admissionGate('private').stats().active).toBe(0)
    vi.unstubAllEnvs()
  })

  it('answers 503 with private headers when the session lookup itself throws', async () => {
    requireVisitorPrincipal.mockRejectedValue(new Error('connect ECONNREFUSED'))

    const res = await GET(request({ type: 'articles', id: '42' }))

    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('retry-after')).toBe('2')
    expect(admissionGate('private').stats().active).toBe(0)
  })

  it('does not leak internal error text on a 500', async () => {
    find.mockRejectedValue(new Error('relation "articles" does not exist'))

    const res = await GET(request({ type: 'articles', id: '42' }))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ message: 'Failed to load article.' })
  })
})

describe('GET /api/public/articles/full — success', () => {
  it('returns the whole body, untruncated and with no gate state', async () => {
    const res = await GET(request({ type: 'articles', id: '42' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.contentBlocks).toHaveLength(5)
    expect(body.gate).toBeUndefined()
  })

  it('never allows the response to be stored', async () => {
    const res = await GET(request({ type: 'itineraries', id: '42' }))

    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('vary')).toContain('Cookie')
  })

  it('serves the unlocked body from an allowed origin with a cookie', async () => {
    const res = await GET(
      request(
        { type: 'articles', id: '42' },
        { origin: 'http://localhost:3000', cookie: 'questura_visitor.session_token=abc' },
      ),
    )

    expect(res.status).toBe(200)
    expect(requireVisitorPrincipal).toHaveBeenCalled()
  })

  it('sends no-store on refusals too', async () => {
    requireVisitorPrincipal.mockResolvedValue(entitled(false))

    const res = await GET(request({ type: 'articles', id: '42' }))

    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('queries only published articles in the requested language', async () => {
    await GET(request({ type: 'maps', id: '42', lang: 'en' }))

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'single-type-listicles',
        where: {
          and: [
            { id: { equals: '42' } },
            { status: { equals: 'published' } },
            { language: { equals: 'en' } },
          ],
        },
      }),
    )
  })
})
