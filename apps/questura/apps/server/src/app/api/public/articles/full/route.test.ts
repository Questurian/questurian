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

const { GET } = await import('./route')

function request(query: Record<string, string>, headers: Record<string, string> = {}): NextRequest {
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

    expect(requireVisitorPrincipal).toHaveBeenCalledWith(expect.any(Headers))
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
