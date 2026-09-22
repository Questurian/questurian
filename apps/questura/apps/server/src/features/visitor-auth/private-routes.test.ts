import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Discovery finding 2, at the routes: every costly account read runs inside
 * ingress and the private gate, a caller without a session cookie costs
 * nothing, and a dependency failure is a temporary 503 — never "signed out",
 * never "no bookmarks", never a response a cache may keep.
 *
 * The session store is stubbed by token so two synthetic members (A and B), a
 * signed-in non-member and an expired session can be mixed in one run. The
 * real cookie-signature and database behaviour is exercised by the sandbox
 * integration (`scripts/readiness/`), not here.
 */

type Principal = { id: string; membership: { active: boolean } }

const SESSIONS: Record<string, Principal> = {
  'token-a': { id: 'user-a', membership: { active: true } },
  'token-b': { id: 'user-b', membership: { active: true } },
  'token-nonmember': { id: 'user-n', membership: { active: false } },
}
const REFS: Record<string, Array<{ targetType: string; targetId: number }>> = {
  'user-a': [{ targetType: 'articles', targetId: 1 }],
  'user-b': [{ targetType: 'maps', targetId: 2 }],
  'user-n': [],
}

function tokenOf(headers: Headers): string | null {
  return /questura_visitor\.session_token=([^;]+)/.exec(headers.get('cookie') ?? '')?.[1] ?? null
}

const lookups = vi.hoisted(() => ({ count: 0, gate: null as Promise<void> | null, fail: false }))

async function resolve(headers: Headers) {
  lookups.count += 1
  if (lookups.gate) await lookups.gate
  if (lookups.fail) throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
  const principal = SESSIONS[tokenOf(headers) ?? '']
  return principal ? { authenticated: true as const, principal } : { authenticated: false as const, principal: null }
}

vi.mock('@/features/visitor-auth/lib/current-principal', () => ({
  getCurrentPrincipal: vi.fn((headers: Headers) => resolve(headers)),
  requireCurrentPrincipal: vi.fn(async (headers: Headers) => {
    const result = await resolve(headers)
    return result.principal
      ? { result, principal: result.principal, error: null, status: 200 }
      : { result, principal: null, error: 'Authentication required', status: 401 }
  }),
}))

vi.mock('@/features/visitor-auth/lib/better-auth', () => ({ visitorAuthPool: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ db: {} }) }))
vi.mock('@/payload.config', () => ({ default: {} }))

const listBookmarkRefs = vi.fn(async (userId: string) => REFS[userId] ?? [])
vi.mock('@/features/bookmarks/lib/service', () => ({
  listBookmarkRefs: (userId: string) => listBookmarkRefs(userId),
  listBookmarkPage: vi.fn(async ({ authUserId }: { authUserId: string }) => ({ docs: REFS[authUserId] ?? [], page: 1 })),
  addBookmark: vi.fn(async () => undefined),
  removeBookmark: vi.fn(async () => undefined),
  targetExists: vi.fn(async () => true),
}))

const traffic = vi.hoisted(() => ({ decide: null as null | ((token: string) => unknown) }))
vi.mock('@/features/visitor-auth/lib/session-traffic-limit', () => ({
  checkSessionTrafficLimit: vi.fn(async (_headers: Headers, token: string) =>
    traffic.decide ? traffic.decide(token) : { allowed: true },
  ),
}))

const writeLimit = vi.hoisted(() => ({ result: { allowed: true } as Record<string, unknown> }))
vi.mock('@/features/bookmarks/lib/rate-limit', () => ({
  checkBookmarkWriteRateLimit: vi.fn(async () => writeLimit.result),
}))

const me = await import('@/app/api/me/route')
const refs = await import('@/app/api/account/bookmarks/refs/route')
const bookmarks = await import('@/app/api/account/bookmarks/route')
const { admissionGate, resetAdmissionGates } = await import('@/shared/http/admission')

const ORIGIN = 'http://localhost:3000'

function request(path: string, token: string | null, init: { method?: string; cookie?: string } = {}): NextRequest {
  const url = new URL(`http://api.local${path}`)
  const cookie = init.cookie ?? (token ? `theme=dark; questura_visitor.session_token=${token}` : 'theme=dark')
  return {
    method: init.method ?? 'GET',
    headers: new Headers({ origin: ORIGIN, cookie }),
    nextUrl: url,
    url: url.toString(),
    signal: undefined,
    json: async () => ({ targetType: 'articles', targetId: 5 }),
  } as unknown as NextRequest
}

beforeEach(() => {
  resetAdmissionGates()
  lookups.count = 0
  lookups.gate = null
  lookups.fail = false
  traffic.decide = null
  writeLimit.result = { allowed: true }
  listBookmarkRefs.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetAdmissionGates()
})

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.headers.get('vary')).toContain('Cookie')
}

describe('a caller with no session cookie costs nothing', () => {
  it.each([
    ['no cookie at all', ''],
    ['an unrelated cookie', 'theme=dark'],
    // Used to choose the expensive branch: the old test matched cookie *text*.
    ['a cookie whose value mentions the prefix', 'note=questura_visitor'],
    ['another cookie under the prefix', 'questura_visitor.theme=dark'],
    ['an empty session cookie', 'questura_visitor.session_token='],
  ])('/api/me with %s: anonymous, no lookup, no gate', async (_label, cookie) => {
    const response = await me.GET(request('/api/me', null, { cookie }))
    expect(await response.json()).toEqual({ authenticated: false, principal: null })
    expect(lookups.count).toBe(0)
    expect(admissionGate('private').stats().admitted).toBe(0)
    expectPrivate(response)
  })

  it('refs answers signed-out without a lookup', async () => {
    const response = await refs.GET(request('/api/account/bookmarks/refs', null))
    expect(await response.json()).toEqual({ authenticated: false, refs: [] })
    expect(lookups.count).toBe(0)
  })

  it.each(['GET', 'POST', 'DELETE'] as const)('bookmarks %s refuses before any work', async (method) => {
    const response = await bookmarks[method](
      request('/api/account/bookmarks?targetType=articles&targetId=5', null, { method }),
    )
    expect(response.status).toBe(401)
    expect(lookups.count).toBe(0)
    expectPrivate(response)
  })
})

describe('mixed callers keep exact identities', () => {
  it('never shows one member another member’s identity or bookmarks', async () => {
    const callers = ['token-a', 'token-b', 'token-nonmember', 'token-expired', null, 'token-a', 'token-b']
    const results = await Promise.all(
      callers.map(async (token) => {
        const identity = await (await me.GET(request('/api/me', token))).json()
        const saved = await (await refs.GET(request('/api/account/bookmarks/refs', token))).json()
        return { token, identity, saved }
      }),
    )

    for (const { token, identity, saved } of results) {
      const expected = SESSIONS[token ?? '']
      if (!expected) {
        expect(identity).toEqual({ authenticated: false, principal: null })
        expect(saved).toEqual({ authenticated: false, refs: [] })
        continue
      }
      expect(identity.principal.id).toBe(expected.id)
      expect(identity.principal.membership.active).toBe(expected.membership.active)
      expect(saved).toEqual({ authenticated: true, refs: REFS[expected.id] })
    }
  })
})

describe('the private gate bounds the lookups', () => {
  it('holds work while blocked, refuses past the queue, and releases on success', async () => {
    vi.stubEnv('PRIVATE_READ_CONCURRENCY', '2')
    vi.stubEnv('PRIVATE_READ_QUEUE', '1')
    resetAdmissionGates()
    let open!: () => void
    lookups.gate = new Promise((resolve) => {
      open = resolve
    })

    const inFlight = [
      me.GET(request('/api/me', 'token-a')),
      refs.GET(request('/api/account/bookmarks/refs', 'token-b')),
      bookmarks.GET(request('/api/account/bookmarks', 'token-a')),
    ]
    await new Promise((resolve) => setTimeout(resolve, 5))
    const stats = admissionGate('private').stats()
    expect(stats.active).toBe(2)
    expect(stats.queued).toBe(1)
    expect(lookups.count).toBe(2)

    const refused = await me.GET(request('/api/me', 'token-b'))
    expect(refused.status).toBe(503)
    expect(refused.headers.get('x-questura-overload')).toBe('private; queue-full')
    expect(refused.headers.get('retry-after')).toBe('1')
    expectPrivate(refused)

    // The anonymous path is untouched by a full private gate.
    expect((await me.GET(request('/api/me', null))).status).toBe(200)

    open()
    for (const response of await Promise.all(inFlight)) expect(response.status).toBe(200)
    expect(admissionGate('private').stats()).toMatchObject({ active: 0, queued: 0 })
    expect((await me.GET(request('/api/me', 'token-b'))).status).toBe(200)
  })

  it('refuses a waiter that outlives the queue wait', async () => {
    vi.stubEnv('PRIVATE_READ_CONCURRENCY', '1')
    vi.stubEnv('PRIVATE_READ_QUEUE_MS', '20')
    resetAdmissionGates()
    let open!: () => void
    lookups.gate = new Promise((resolve) => {
      open = resolve
    })

    const first = me.GET(request('/api/me', 'token-a'))
    const timedOut = await me.GET(request('/api/me', 'token-b'))
    expect(timedOut.status).toBe(503)
    expect(timedOut.headers.get('x-questura-overload')).toBe('private; queue-timeout')
    open()
    await first
    expect(admissionGate('private').stats().active).toBe(0)
  })
})

describe('a dependency failure is temporary, not a logout', () => {
  it.each([
    ['/api/me', () => me.GET(request('/api/me', 'token-a'))],
    ['refs', () => refs.GET(request('/api/account/bookmarks/refs', 'token-a'))],
    ['bookmark list', () => bookmarks.GET(request('/api/account/bookmarks', 'token-a'))],
    ['bookmark add', () => bookmarks.POST(request('/api/account/bookmarks', 'token-a', { method: 'POST' }))],
  ])('%s answers 503 + Retry-After, private, and releases the slot', async (_label, call) => {
    lookups.fail = true
    const response = await call()

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('2')
    expect(response.headers.get('x-questura-unavailable')).toBe('dependency')
    expectPrivate(response)
    const body = await response.json()
    expect(body).not.toHaveProperty('authenticated')
    expect(admissionGate('private').stats().active).toBe(0)
  })

  it('a failed refs list is a 503, not an empty list', async () => {
    listBookmarkRefs.mockRejectedValueOnce(new Error('timeout'))
    const response = await refs.GET(request('/api/account/bookmarks/refs', 'token-a'))
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('refs')
  })

  it('a write-limit outage is 503 counter-unavailable, not 429', async () => {
    writeLimit.result = { allowed: false, retryAfterSeconds: 5, unavailable: true }
    const response = await bookmarks.POST(request('/api/account/bookmarks', 'token-a', { method: 'POST' }))
    expect(response.status).toBe(503)
    expect(response.headers.get('x-questura-unavailable')).toBe('counter-unavailable')
  })

  it('a real write limit is 429 with its own scope', async () => {
    writeLimit.result = { allowed: false, retryAfterSeconds: 30 }
    const response = await bookmarks.DELETE(
      request('/api/account/bookmarks?targetType=articles&targetId=5', 'token-a', { method: 'DELETE' }),
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('x-questura-limit')).toBe('account')
    expect(response.headers.get('retry-after')).toBe('30')
  })
})

describe('one noisy caller beside everyone else', () => {
  it('limits the noisy session before any lookup, and leaves the others alone', async () => {
    traffic.decide = (token) =>
      token === 'token-a' ? { allowed: false, retryAfterSeconds: 40, scope: 'session' } : { allowed: true }

    const noisy = await me.GET(request('/api/me', 'token-a'))
    expect(noisy.status).toBe(429)
    expect(noisy.headers.get('x-questura-limit')).toBe('session')
    expectPrivate(noisy)
    expect(lookups.count).toBe(0)

    const quiet = await (await me.GET(request('/api/me', 'token-b'))).json()
    expect(quiet.principal.id).toBe('user-b')
  })
})
