import { describe, expect, it } from 'vitest'

import { runChecks, type Target } from './checks'

/**
 * The launch-day runner, against a fake server. A healthy server passes
 * every check; each kind of misconfiguration fails the check that exists to
 * find it and nothing else. The real proof is a run against the readiness
 * sandbox (`--allow-http`), recorded in the PR that added this.
 */

const TARGET: Target = {
  client: 'https://www.example.test',
  api: 'https://api.example.test',
  expectPrices: { monthly: 1299, yearly: 7999 },
  allowHttp: false,
  rateLimitProbe: false,
}

type Behaviour = Partial<{
  hsts: string | null
  frame: string | null
  homeCache: string
  homeSetsCookie: boolean
  prices: number[]
  meCache: string
  meVary: string
  foreignStatus: number
  reflectForeign: boolean
  webhookStatus: number
  bypassStatus: number | 'unreachable'
  rateLimited: boolean
  homeRedirectsOff: boolean
}>

function fakeServer(behaviour: Behaviour = {}): typeof fetch {
  const b = {
    hsts: 'max-age=31536000; includeSubDomains',
    frame: "frame-ancestors 'none'",
    homeCache: 'public, s-maxage=300',
    homeSetsCookie: false,
    prices: [1299, 7999],
    meCache: 'no-store, no-cache, must-revalidate',
    meVary: 'Origin, Cookie',
    foreignStatus: 403,
    reflectForeign: false,
    webhookStatus: 400,
    bypassStatus: 'unreachable' as number | 'unreachable',
    rateLimited: true,
    ...behaviour,
  }
  let plansCalls = 0

  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const headers = new Headers(init.headers)
    const method = init.method ?? 'GET'
    const base: Record<string, string> = b.hsts ? { 'strict-transport-security': b.hsts } : {}
    const origin = headers.get('origin')
    const cors: Record<string, string> =
      origin && (origin === TARGET.client || b.reflectForeign) ? { 'access-control-allow-origin': origin } : {}

    if (TARGET.bypassOrigin === undefined && url.origin === 'https://bypass.example.test') {
      if (b.bypassStatus === 'unreachable') throw new TypeError('fetch failed')
      return new Response('', { status: b.bypassStatus })
    }
    if (url.origin === TARGET.client && url.pathname === '/' && b.homeRedirectsOff) {
      return Object.defineProperty(new Response('', { status: 200 }), 'url', { value: 'https://evil.example/' })
    }
    if (url.origin === TARGET.client && url.pathname === '/') {
      const h: Record<string, string> = { ...base, 'cache-control': b.homeCache }
      if (b.frame) h['content-security-policy'] = b.frame
      if (b.homeSetsCookie) h['set-cookie'] = 'x=1'
      return new Response('<html></html>', { status: 200, headers: h })
    }
    switch (url.pathname) {
      case '/api/health/ready':
        return Response.json({ ready: true }, { headers: base })
      case '/api/payments/plans':
        plansCalls += 1
        if (b.rateLimited && plansCalls > 31) return new Response('', { status: 429 })
        return Response.json({ plans: b.prices.map((amount) => ({ amount })) }, { headers: { ...base, ...cors } })
      case '/api/me':
        return Response.json({ authenticated: false }, { headers: { 'cache-control': b.meCache, vary: b.meVary, ...cors } })
      case '/api/payments/webhooks/stripe':
        return new Response('', { status: b.webhookStatus })
    }
    if (url.pathname.startsWith('/api/payments/')) {
      if (method === 'OPTIONS') return new Response('', { status: 200, headers: cors })
      if (origin && origin !== TARGET.client) return new Response('', { status: b.foreignStatus, headers: cors })
      return new Response('', { status: 401, headers: cors })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
}

const failures = async (behaviour: Behaviour, target: Partial<Target> = {}) =>
  (await runChecks({ ...TARGET, ...target }, fakeServer(behaviour))).filter((r) => !r.ok).map((r) => r.name)

describe('launch-verify checks', () => {
  it('a healthy server passes every check', async () => {
    expect(await failures({})).toEqual([])
  })

  it.each<[string, Behaviour, RegExp]>([
    ['no HSTS', { hsts: null }, /HSTS/],
    ['framable site', { frame: null }, /framed/],
    ['Set-Cookie on a cacheable page', { homeSetsCookie: true }, /Set-Cookie/],
    ['laptop price instead of catalog', { prices: [50, 7999] }, /monthly price/],
    ['cacheable /api/me', { meCache: 'public, max-age=60' }, /no-store/],
    ['/api/me not varying on Cookie', { meVary: 'Origin' }, /varies on Cookie/],
    ['foreign origin accepted', { foreignStatus: 200 }, /foreign origin/],
    ['foreign origin reflected', { reflectForeign: true }, /foreign origin|preflight/],
    ['webhook accepts unsigned', { webhookStatus: 200 }, /unsigned|forged/],
  ])('%s fails the matching check', async (_label, behaviour, pattern) => {
    const failed = await failures(behaviour)
    expect(failed.length).toBeGreaterThan(0)
    for (const name of failed) expect(name).toMatch(pattern)
  })

  it('a home page that redirects off the site fails', async () => {
    expect(await failures({ homeRedirectsOff: true })).toContain('site home page answers 200 on this site')
  })

  it('refuses plain http unless told this is the sandbox', async () => {
    const results = await runChecks({ ...TARGET, api: 'http://api.example.test' }, fakeServer())
    expect(results.find((r) => r.name === 'api origin is https')?.ok).toBe(false)
    const sandbox = await runChecks({ ...TARGET, api: 'http://api.example.test', allowHttp: true }, fakeServer())
    expect(sandbox.find((r) => r.name === 'api origin is https')?.ok).toBe(true)
  })

  it('the bypass origin must not serve the API', async () => {
    const target = { bypassOrigin: 'https://bypass.example.test' }
    expect(await failures({ bypassStatus: 'unreachable' }, target)).toEqual([])
    expect(await failures({ bypassStatus: 403 }, target)).toEqual([])
    expect(await failures({ bypassStatus: 200 }, target)).toEqual([
      'the platform origin https://bypass.example.test does not serve the API',
    ])
  })

  it('the rate-limit probe fails when forged addresses buy fresh budgets', async () => {
    expect(await failures({ rateLimited: true }, { rateLimitProbe: true })).toEqual([])
    expect(await failures({ rateLimited: false }, { rateLimitProbe: true })).toEqual([
      'forged address headers do not buy a fresh plans budget (31st → 429)',
    ])
  })
})
