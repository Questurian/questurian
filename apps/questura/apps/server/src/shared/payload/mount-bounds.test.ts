import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })))

vi.mock('@/shared/http/public-read-rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/http/public-read-rate-limit')>()
  return { ...actual, checkPublicReadRateLimit: rateLimit }
})

const { authenticatedGraphQLOnly, boundedRestRead, clampMountQuery, looksAnonymous } = await import('./mount-bounds')
const { resetAdmissionGates } = await import('@/shared/http/admission')

function request(url: string, init: RequestInit = {}): NextRequest {
  return new Request(url, init) as NextRequest
}

beforeEach(() => {
  rateLimit.mockReset()
  rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
  resetAdmissionGates()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetAdmissionGates()
})

/**
 * The mount's coverage gaps, closed at the route because a `beforeOperation`
 * hook cannot reach them: globals are not decorated by the plugin, a hook
 * bounds a read rather than a request, and one GraphQL POST is many reads.
 */
describe('looksAnonymous', () => {
  it.each([
    ['no headers at all', {}],
    ['an unrelated cookie', { cookie: 'theme=dark' }],
  ])('treats %s as anonymous', (_label, headers) => {
    expect(looksAnonymous(request('http://x/api/locations', { headers }))).toBe(true)
  })

  // Presence of a credential is all this decides. Payload still authenticates
  // it properly — a forged cookie gets past this and fails there.
  it.each([
    ['a staff session cookie', { cookie: 'payload-token=abc' }],
    ['an authorization header', { authorization: 'Bearer abc' }],
    ['an api key header', { 'x-api-key': 'abc' }],
  ])('treats %s as not anonymous', (_label, headers) => {
    expect(looksAnonymous(request('http://x/api/locations', { headers }))).toBe(false)
  })
})

describe('clampMountQuery', () => {
  // The one that mattered: 271 MB to an anonymous caller in 1.3 s.
  it('caps depth and limit', () => {
    const url = clampMountQuery(new URL('http://x/api/locations?limit=1000&depth=10'))
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('depth')).toBe('2')
  })

  // `pagination=false` means every row, and a global would honour it.
  it('forces pagination on, however it was asked for', () => {
    const url = clampMountQuery(new URL('http://x/api/locations?pagination=false'))
    expect(url.searchParams.get('pagination')).toBe('true')
  })

  it('supplies the bound when nothing was asked for', () => {
    const url = clampMountQuery(new URL('http://x/api/globals/main-homepage'))
    expect(url.searchParams.get('depth')).toBe('2')
    expect(url.searchParams.get('limit')).toBe('100')
  })

  it.each(['-1', 'abc', '0', 'Infinity'])('replaces a nonsense limit (%s) with the bound', (value) => {
    const url = clampMountQuery(new URL(`http://x/api/locations?limit=${value}`))
    expect(url.searchParams.get('limit')).toBe('100')
  })

  it('leaves a request that already fits alone', () => {
    const url = clampMountQuery(new URL('http://x/api/locations?limit=10&depth=1&pagination=true'))
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('depth')).toBe('1')
  })

  it('keeps every other query parameter', () => {
    const url = clampMountQuery(new URL('http://x/api/locations?where[slug][equals]=lima&depth=9'))
    expect(url.searchParams.get('where[slug][equals]')).toBe('lima')
  })
})

describe('boundedRestRead', () => {
  it('clamps what reaches Payload, including a global', async () => {
    const seen: string[] = []
    const handler = boundedRestRead(async (req) => {
      seen.push(req.url)
      return new Response('ok')
    })

    await handler(request('http://x/api/globals/main-homepage?depth=10'), undefined)
    expect(seen[0]).toContain('depth=2')
  })

  it('refuses a caller who is asking too often, before any read', async () => {
    rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 7 })
    const handler = vi.fn(async () => new Response('ok'))

    const response = await boundedRestRead(handler)(request('http://x/api/locations'), undefined)

    expect(response.status).toBe(429)
    expect(handler).not.toHaveBeenCalled()
  })

  // The slot is held for the whole request. A hook could only take one and
  // give it back before the SQL ran.
  it('holds an admission slot until the handler has actually finished', async () => {
    vi.stubEnv('PUBLIC_QUERY_CONCURRENCY', '1')
    vi.stubEnv('PUBLIC_QUERY_QUEUE', '0')
    resetAdmissionGates()

    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })

    const handler = boundedRestRead(async () => {
      await blocked
      return new Response('ok')
    })

    const first = handler(request('http://x/api/locations'), undefined)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = await handler(request('http://x/api/locations'), undefined)

    expect(second.status).toBe(503)
    expect(second.headers.get('Cache-Control')).toBe('no-store')
    expect(second.headers.get('Retry-After')).toBe('1')

    release()
    expect((await first).status).toBe(200)
  })

  it('leaves authenticated staff alone', async () => {
    const handler = vi.fn(async (req: NextRequest) => {
      void req
      return new Response('ok')
    })
    await boundedRestRead(handler as never)(
      request('http://x/api/locations?limit=200&depth=2', { headers: { cookie: 'payload-token=abc' } }),
      undefined,
    )

    expect(rateLimit).not.toHaveBeenCalled()
    expect((handler.mock.calls[0] as unknown as [NextRequest])[0].url).toContain('limit=200')
  })

  // The mount also serves sign-in. A read gate must not refuse a write.
  it('does not touch anything that is not a GET', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    await boundedRestRead(handler)(request('http://x/api/users/login', { method: 'POST' }), undefined)

    expect(rateLimit).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalled()
  })
})

describe('authenticatedGraphQLOnly', () => {
  it('closes the mount to anonymous callers', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const response = await authenticatedGraphQLOnly(handler)(
      request('http://x/api/graphql', { method: 'POST' }),
      undefined,
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(handler).not.toHaveBeenCalled()
  })

  it('says where the public site reads instead, so the refusal is actionable', async () => {
    const response = await authenticatedGraphQLOnly(async () => new Response('ok'))(
      request('http://x/api/graphql', { method: 'POST' }),
      undefined,
    )
    await expect(response.json()).resolves.toMatchObject({
      errors: [{ message: expect.stringContaining('/api/public/*') }],
    })
  })

  it('lets a credential through to Payload, which does the real check', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const response = await authenticatedGraphQLOnly(handler)(
      request('http://x/api/graphql', { method: 'POST', headers: { cookie: 'payload-token=abc' } }),
      undefined,
    )

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalled()
  })
})

/**
 * The generated route files are designed to be overwritten, so the guard
 * against losing the wrapper has to live somewhere that is not those files.
 */
describe('the generated mounts still carry their bounds', () => {
  const routes = resolve(__dirname, '../../app/(payload)/api')

  it('wraps the REST GET handler', () => {
    const file = readFileSync(resolve(routes, '[...slug]/route.ts'), 'utf8')
    expect(file, 'Payload regenerated this route and dropped the bound').toContain('boundedRestRead')
    expect(file).toMatch(/export const GET = boundedRestRead\(/)
  })

  it('keeps anonymous GraphQL closed', () => {
    const file = readFileSync(resolve(routes, 'graphql/route.ts'), 'utf8')
    expect(file, 'Payload regenerated this route and reopened anonymous GraphQL').toContain(
      'authenticatedGraphQLOnly',
    )
    expect(file).toMatch(/export const POST = authenticatedGraphQLOnly\(/)
  })
})
