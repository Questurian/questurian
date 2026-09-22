import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })))

vi.mock('@/shared/http/public-read-rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/http/public-read-rate-limit')>()
  return { ...actual, checkPublicReadRateLimit: rateLimit }
})

const { authenticatedGraphQLOnly, boundedRestPost, boundedRestRead, clampMountQuery, classifyMountCaller, presentsCredential } =
  await import('./mount-bounds')
const { admissionGate } = await import('@/shared/http/admission')

type Identity = { collection?: string; status?: string | null } | null

/**
 * A stand-in for `payload.auth`: only these exact credentials prove anyone.
 * Everything else — forged, expired, bogus, disabled — resolves to nobody,
 * which is what Payload's JWT and API-key strategies really return (they do
 * not reject; discovery finding 1).
 */
const VALID: Record<string, Identity> = {
  'Bearer staff-jwt': { collection: 'users', status: 'active' },
  'service-accounts API-Key good-key': { collection: 'service-accounts' },
  'Bearer disabled-jwt': { collection: 'users', status: 'disabled' },
}
const resolveIdentity = vi.fn(async (headers: Headers): Promise<Identity> => {
  const cookie = headers.get('cookie') ?? ''
  if (cookie.includes('payload-token=staff-cookie')) return { collection: 'users', status: 'active' }
  return VALID[headers.get('authorization') ?? ''] ?? null
})
const opts = { resolveIdentity }
const { resetAdmissionGates } = await import('@/shared/http/admission')

function request(url: string, init: RequestInit = {}): NextRequest {
  return new Request(url, init) as NextRequest
}

beforeEach(() => {
  resolveIdentity.mockClear()
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
describe('presentsCredential', () => {
  it.each([
    ['no headers at all', {}],
    ['an unrelated cookie', { cookie: 'theme=dark' }],
    // A visitor session authenticates nothing on the Payload mount.
    ['a visitor session cookie', { cookie: 'questura_visitor.session_token=abc' }],
    // Text that merely mentions a session is not a cookie named for one.
    ['a cookie whose value mentions payload-token', { cookie: 'note=payload-token' }],
    // Payload reads no such header; it used to buy a bypass anyway.
    ['an x-api-key header', { 'x-api-key': 'abc' }],
  ])('treats %s as no credential', (_label, headers) => {
    expect(presentsCredential(request('http://x/api/locations', { headers }))).toBe(false)
  })

  it.each([
    ['a staff session cookie', { cookie: 'theme=dark; payload-token=abc' }],
    ['an authorization header', { authorization: 'Bearer abc' }],
  ])('treats %s as a credential to verify — not as proof', (_label, headers) => {
    expect(presentsCredential(request('http://x/api/locations', { headers }))).toBe(true)
  })
})

describe('classifyMountCaller', () => {
  it.each([
    ['absent', {}, 'anonymous'],
    ['an unrelated cookie', { cookie: 'theme=dark' }, 'anonymous'],
    ['a malformed header', { authorization: '!!!' }, 'unverified'],
    ['an expired JWT', { authorization: 'Bearer expired-jwt' }, 'unverified'],
    ['a forged payload-token', { cookie: 'payload-token=forged' }, 'unverified'],
    ['a bogus API key', { authorization: 'service-accounts API-Key nope' }, 'unverified'],
    ['a disabled staff account', { authorization: 'Bearer disabled-jwt' }, 'unverified'],
    ['valid staff', { authorization: 'Bearer staff-jwt' }, 'staff'],
    ['a valid staff cookie', { cookie: 'payload-token=staff-cookie' }, 'staff'],
    ['a valid service account', { authorization: 'service-accounts API-Key good-key' }, 'service'],
  ])('%s → %s', async (_label, headers, expected) => {
    await expect(classifyMountCaller(request('http://x/api/locations', { headers }), resolveIdentity)).resolves.toBe(
      expected,
    )
  })

  it('does no verification work when nothing was presented', async () => {
    await classifyMountCaller(request('http://x/api/locations'), resolveIdentity)
    expect(resolveIdentity).not.toHaveBeenCalled()
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
    }, opts)

    await handler(request('http://x/api/globals/main-homepage?depth=10'), undefined)
    expect(seen[0]).toContain('depth=2')
  })

  it('refuses a caller who is asking too often, before any read', async () => {
    rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 7 })
    const handler = vi.fn(async () => new Response('ok'))

    const response = await boundedRestRead(handler, opts)(request('http://x/api/locations'), undefined)

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
    }, opts)

    const first = handler(request('http://x/api/locations'), undefined)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = await handler(request('http://x/api/locations'), undefined)

    expect(second.status).toBe(503)
    expect(second.headers.get('Cache-Control')).toBe('no-store')
    expect(second.headers.get('Retry-After')).toBe('1')

    release()
    expect((await first).status).toBe(200)
  })

  it('keeps a verified staff read as asked, without the anonymous limiter', async () => {
    const handler = vi.fn(async (req: NextRequest) => {
      void req
      return new Response('ok')
    })
    await boundedRestRead(handler as never, opts)(
      request('http://x/api/locations?limit=200&depth=2', { headers: { authorization: 'Bearer staff-jwt' } }),
      undefined,
    )

    expect(rateLimit).not.toHaveBeenCalled()
    const seen = (handler.mock.calls[0] as unknown as [NextRequest])[0]
    expect(seen.url).toContain('limit=200')
    // Payload still sees the credential, so collection access is unchanged.
    expect(seen.headers.get('authorization')).toBe('Bearer staff-jwt')
  })

  it('keeps a verified service-account read, inside the staff gate', async () => {
    let activeStaff = -1
    const handler = boundedRestRead(async () => {
      activeStaff = admissionGate('staff').stats().active
      return new Response('ok')
    }, opts)
    await handler(
      request('http://x/api/locations?limit=200', { headers: { authorization: 'service-accounts API-Key good-key' } }),
      undefined,
    )
    expect(activeStaff).toBe(1)
    expect(admissionGate('staff').stats().active).toBe(0)
  })

  // Finding 1: a made-up credential used to skip the limiter, the clamp and
  // the gate. Each one must now get exactly the anonymous policy.
  it.each([
    ['a malformed header', { authorization: '!!!' }],
    ['an expired JWT', { authorization: 'Bearer expired-jwt' }],
    ['a forged JWT', { authorization: 'Bearer forged' }],
    ['a forged payload-token', { cookie: 'payload-token=forged; theme=dark' }],
    ['a bogus API key', { authorization: 'service-accounts API-Key nope' }],
    ['a disabled staff account', { authorization: 'Bearer disabled-jwt' }],
    ['an x-api-key header', { 'x-api-key': 'anything' }],
    ['a visitor session', { cookie: 'questura_visitor.session_token=abc' }],
  ])('gives %s the anonymous policy, credential removed', async (_label, headers) => {
    const handler = vi.fn(async (req: NextRequest) => {
      void req
      return new Response('ok')
    })
    await boundedRestRead(handler as never, opts)(
      request('http://x/api/globals/main-homepage?limit=1000&depth=10&pagination=false', { headers }),
      undefined,
    )

    expect(rateLimit).toHaveBeenCalledTimes(1)
    const seen = (handler.mock.calls[0] as unknown as [NextRequest])[0]
    const url = new URL(seen.url)
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('depth')).toBe('2')
    expect(url.searchParams.get('pagination')).toBe('true')
    // Payload does not verify it a second time.
    expect(seen.headers.get('authorization')).toBeNull()
    expect(seen.headers.get('cookie') ?? '').not.toContain('payload-token')
  })

  it('keeps an unrelated cookie on the anonymous request', async () => {
    const handler = vi.fn(async (req: NextRequest) => {
      void req
      return new Response('ok')
    })
    await boundedRestRead(handler as never, opts)(
      request('http://x/api/locations', { headers: { cookie: 'payload-token=forged; payload-lng=es' } }),
      undefined,
    )
    expect((handler.mock.calls[0] as unknown as [NextRequest])[0].headers.get('cookie')).toBe('payload-lng=es')
  })

  it('does not let a caller forge the route-counted mark', async () => {
    const handler = vi.fn(async (req: NextRequest) => {
      void req
      return new Response('ok')
    })
    await boundedRestRead(handler as never, opts)(
      request('http://x/api/locations', { headers: { 'x-questura-mount-counted': 'guess' } }),
      undefined,
    )
    const mark = (handler.mock.calls[0] as unknown as [NextRequest])[0].headers.get('x-questura-mount-counted')
    expect(mark).not.toBe('guess')
    expect(mark).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('answers 503, not an anonymous read, when verification itself fails', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const response = await boundedRestRead(handler, {
      resolveIdentity: async () => {
        throw new Error('database unavailable')
      },
    })(request('http://x/api/locations', { headers: { authorization: 'Bearer staff-jwt' } }), undefined)

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(handler).not.toHaveBeenCalled()
  })

  // Ingress is taken before the limiter (a Redis call) and before
  // verification (a query), so a slow dependency cannot collect unbounded
  // waiters.
  it('refuses at ingress while the limiter is stalled, and recovers after', async () => {
    vi.stubEnv('PUBLIC_INGRESS_CONCURRENCY', '2')
    vi.stubEnv('PUBLIC_INGRESS_QUEUE', '0')
    resetAdmissionGates()

    let unstall!: () => void
    const stalled = new Promise<void>((resolve) => {
      unstall = resolve
    })
    rateLimit.mockImplementation(async () => {
      await stalled
      return { allowed: true, retryAfterSeconds: 0 }
    })

    const handler = boundedRestRead(async () => new Response('ok'), opts)
    const held = [handler(request('http://x/api/locations'), undefined), handler(request('http://x/api/locations'), undefined)]
    await new Promise((resolve) => setTimeout(resolve, 5))

    const refused = await handler(request('http://x/api/locations'), undefined)
    expect(refused.status).toBe(503)
    expect(refused.headers.get('X-Questura-Overload')).toBe('ingress; queue-full')
    expect(admissionGate('ingress').stats().active).toBe(2)

    unstall()
    for (const response of await Promise.all(held)) expect(response.status).toBe(200)
    expect(admissionGate('ingress').stats().active).toBe(0)
    rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    expect((await handler(request('http://x/api/locations'), undefined)).status).toBe(200)
  })

  it('bounds a flood of invented credentials in the credential gate', async () => {
    vi.stubEnv('MOUNT_CREDENTIAL_CONCURRENCY', '1')
    vi.stubEnv('MOUNT_CREDENTIAL_QUEUE', '0')
    resetAdmissionGates()

    let unblock!: () => void
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve
    })
    const slowResolve = vi.fn(async () => {
      await blocked
      return null
    })
    const handler = boundedRestRead(async () => new Response('ok'), { resolveIdentity: slowResolve })
    const bogus = () => request('http://x/api/locations', { headers: { authorization: 'Bearer forged' } })

    const first = handler(bogus(), undefined)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await handler(bogus(), undefined)

    expect(second.status).toBe(503)
    expect(second.headers.get('X-Questura-Overload')).toBe('credential; queue-full')
    expect(slowResolve).toHaveBeenCalledTimes(1)
    // A request with no credential is not in that line at all.
    expect((await handler(request('http://x/api/locations'), undefined)).status).toBe(200)

    unblock()
    expect((await first).status).toBe(200)
    expect(admissionGate('credential').stats().active).toBe(0)
  })

  it('releases every slot when the handler throws', async () => {
    const handler = boundedRestRead(async () => {
      throw new Error('boom')
    }, opts)
    await expect(handler(request('http://x/api/locations'), undefined)).rejects.toThrow('boom')
    await expect(
      handler(request('http://x/api/locations', { headers: { authorization: 'Bearer staff-jwt' } }), undefined),
    ).rejects.toThrow('boom')
    for (const kind of ['ingress', 'query', 'credential', 'staff'] as const) {
      expect(admissionGate(kind).stats().active, kind).toBe(0)
    }
  })

  it('removes a waiter whose client went away', async () => {
    vi.stubEnv('PUBLIC_QUERY_CONCURRENCY', '1')
    resetAdmissionGates()
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const handler = boundedRestRead(async () => {
      await blocked
      return new Response('ok')
    }, opts)

    const first = handler(request('http://x/api/locations'), undefined)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const controller = new AbortController()
    // The test environment's Request and AbortSignal come from different
    // realms, so the signal is attached the way the route sees it.
    const abandoned = Object.defineProperty(request('http://x/api/locations'), 'signal', { value: controller.signal })
    const waiting = handler(abandoned, undefined)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(admissionGate('query').stats().queued).toBe(1)

    controller.abort()
    expect((await waiting).status).toBe(503)
    expect(admissionGate('query').stats().queued).toBe(0)
    release()
    await first
  })

  // The mount also serves sign-in. A read gate must not refuse a write.
  it('does not touch anything that is not a GET', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    await boundedRestRead(handler, opts)(request('http://x/api/users/login', { method: 'POST' }), undefined)

    expect(rateLimit).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalled()
  })
})

describe('authenticatedGraphQLOnly', () => {
  it('closes the mount to anonymous callers', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const response = await authenticatedGraphQLOnly(handler, opts)(
      request('http://x/api/graphql', { method: 'POST' }),
      undefined,
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(handler).not.toHaveBeenCalled()
  })

  it('says where the public site reads instead, so the refusal is actionable', async () => {
    const response = await authenticatedGraphQLOnly(async () => new Response('ok'), opts)(
      request('http://x/api/graphql', { method: 'POST' }),
      undefined,
    )
    await expect(response.json()).resolves.toMatchObject({
      errors: [{ message: expect.stringContaining('/api/public/*') }],
    })
  })

  // Payload would not refuse these: a strategy that proves nobody leaves
  // `user: null` and the query runs as a public read. The alias-heavy body is
  // the reason the mount is closed at all.
  it.each([
    ['a forged payload-token', { cookie: 'payload-token=forged' }],
    ['an expired JWT', { authorization: 'Bearer expired-jwt' }],
    ['a bogus API key', { authorization: 'service-accounts API-Key nope' }],
    ['a disabled staff account', { authorization: 'Bearer disabled-jwt' }],
    ['an x-api-key header', { 'x-api-key': 'anything' }],
  ])('refuses %s before GraphQL runs', async (_label, headers) => {
    const handler = vi.fn(async () => new Response('ok'))
    const aliases = Array.from({ length: 50 }, (_, i) => `a${i}: Locations(limit: 100) { docs { id } }`).join(' ')
    const response = await authenticatedGraphQLOnly(handler, opts)(
      request('http://x/api/graphql', { method: 'POST', headers, body: JSON.stringify({ query: `{ ${aliases} }` }) }),
      undefined,
    )

    expect(response.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    ['valid staff', { authorization: 'Bearer staff-jwt' }],
    ['a valid service account', { authorization: 'service-accounts API-Key good-key' }],
  ])('lets %s through, inside the staff gate', async (_label, headers) => {
    let activeStaff = -1
    const response = await authenticatedGraphQLOnly(async () => {
      activeStaff = admissionGate('staff').stats().active
      return new Response('ok')
    }, opts)(request('http://x/api/graphql', { method: 'POST', headers }), undefined)

    expect(response.status).toBe(200)
    expect(activeStaff).toBe(1)
  })
})

describe('boundedRestPost', () => {
  const override = { 'x-payload-http-method-override': 'GET', 'content-type': 'application/json' }

  it('passes an ordinary POST (sign-in) straight through', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    await boundedRestPost(handler, opts)(request('http://x/api/users/login', { method: 'POST' }), undefined)
    expect(handler).toHaveBeenCalled()
    expect(resolveIdentity).not.toHaveBeenCalled()
  })

  // Payload turns this into a read with its query in the body; only GET was
  // wrapped, so it skipped every route bound.
  it.each([
    ['no credential', override],
    ['a forged credential', { ...override, authorization: 'Bearer forged' }],
    ['the generic override header', { 'x-http-method-override': 'GET' }],
  ])('refuses a method-override read with %s', async (_label, headers) => {
    const handler = vi.fn(async () => new Response('ok'))
    const response = await boundedRestPost(handler, opts)(
      request('http://x/api/locations', { method: 'POST', headers, body: '{"limit":100000}' }),
      undefined,
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(handler).not.toHaveBeenCalled()
  })

  it('keeps the admin relationship picker working for verified staff', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const response = await boundedRestPost(handler, opts)(
      request('http://x/api/locations', {
        method: 'POST',
        headers: { ...override, cookie: 'payload-token=staff-cookie' },
        body: '{}',
      }),
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

  it('wraps the REST POST handler, which can be a disguised read', () => {
    const file = readFileSync(resolve(routes, '[...slug]/route.ts'), 'utf8')
    expect(file, 'Payload regenerated this route and dropped the bound').toMatch(
      /export const POST = boundedRestPost\(/,
    )
  })

  it('keeps anonymous GraphQL closed', () => {
    const file = readFileSync(resolve(routes, 'graphql/route.ts'), 'utf8')
    expect(file, 'Payload regenerated this route and reopened anonymous GraphQL').toContain(
      'authenticatedGraphQLOnly',
    )
    expect(file).toMatch(/export const POST = authenticatedGraphQLOnly\(/)
  })
})
