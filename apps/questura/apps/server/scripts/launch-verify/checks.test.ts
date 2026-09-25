import { describe, expect, it } from 'vitest'

import { type EdgeRequest, loopbackAddresses, pageAddresses, runChecks, type Target } from './checks'

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
  // Host checks
  homeHtmlExtra: string
  canonical: string | null
  ogUrl: string | null
  authorCanonical: string
  robotsSitemap: string
  sitemapHost: string
  imageStatus: number
  imageType: string
  unknownPathStatus: number
  chunkApi: string
}>

const ARTICLE = '/peru/lima/culture/a-walk'
const AUTHOR = '/authors/jane'
const CHUNK = '/_next/static/chunks/app-1.js'

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
    homeHtmlExtra: '',
    canonical: `${TARGET.client}/peru/lima` as string | null,
    ogUrl: `${TARGET.client}/peru/lima` as string | null,
    authorCanonical: `${TARGET.client}${AUTHOR}`,
    robotsSitemap: `${TARGET.client}/sitemap.xml`,
    sitemapHost: TARGET.client,
    imageStatus: 200,
    imageType: 'image/jpeg',
    unknownPathStatus: 404,
    chunkApi: TARGET.api,
    ...behaviour,
  }
  const head = (canonical: string | null, ogUrl: string | null) =>
    `${canonical === null ? '' : `<link rel="canonical" href="${canonical}"/>`}${ogUrl === null ? '' : `<meta property="og:url" content="${ogUrl}"/>`}`
  const homeHtml =
    `<html><head>${head(b.canonical, b.ogUrl)}<script src="${CHUNK}" async=""></script></head>` +
    `<body><img alt="" src="https://cdn.example.test/media/a.jpg"/><a href="${AUTHOR}">Jane</a>${b.homeHtmlExtra}</body></html>`
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
      return new Response(homeHtml, { status: 200, headers: h })
    }
    if (url.origin === 'https://cdn.example.test') {
      return new Response('jpeg', { status: b.imageStatus, headers: { 'content-type': b.imageType } })
    }
    if (url.origin === TARGET.client) {
      switch (url.pathname) {
        case '/robots.txt':
          return new Response(`User-Agent: *\nAllow: /\n\nSitemap: ${b.robotsSitemap}\n`)
        case '/sitemap.xml':
          return new Response(`<urlset><url><loc>${b.sitemapHost}/peru</loc></url><url><loc>${b.sitemapHost}${ARTICLE}</loc></url></urlset>`)
        case ARTICLE:
          return new Response(`<html>${head(`${TARGET.client}${ARTICLE}`, `${TARGET.client}${ARTICLE}`)}<a href="${AUTHOR}">Jane</a></html>`)
        case AUTHOR:
          return new Response(`<html>${head(b.authorCanonical, null)}</html>`)
        case CHUNK:
          return new Response(`fetch("${b.chunkApi}/api/me")`, { headers: { 'content-type': 'text/javascript' } })
      }
      return new Response('not found', { status: b.unknownPathStatus })
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
    ['localhost baked into the page', { homeHtmlExtra: '<a href="http://localhost:4000/api/me">x</a>' }, /localhost or 127/],
    ['127.0.0.1 baked into the page', { homeHtmlExtra: '<link rel="preconnect" href="http://127.0.0.1:4100"/>' }, /localhost or 127/],
    ['relative canonical', { canonical: '/peru/lima' }, /home page canonical/],
    ['no canonical', { canonical: null }, /home page canonical/],
    ['canonical on a workers.dev copy', { canonical: 'https://questura-client.example.workers.dev/peru/lima' }, /home page canonical/],
    ['relative og:url', { ogUrl: '/peru/lima' }, /og:url/],
    ['relative author canonical', { authorCanonical: AUTHOR }, /author page canonical/],
    ['robots names another host', { robotsSitemap: 'https://questura-client.example.workers.dev/sitemap.xml' }, /robots/],
    ['sitemap lists another host', { sitemapHost: 'http://localhost:3000' }, /sitemap|article page/],
    ['image host serves nothing', { imageStatus: 404 }, /image/],
    ['image host serves a web page', { imageType: 'text/html' }, /image/],
    ['a soft 404', { unknownPathStatus: 200 }, /404/],
    ['bundle calls another API', { chunkApi: 'http://localhost:4000' }, /script the home page loads/],
  ])('%s fails the matching check', async (_label, behaviour, pattern) => {
    const failed = await failures(behaviour)
    expect(failed.length).toBeGreaterThan(0)
    for (const name of failed) expect(name).toMatch(pattern)
  })

  it('finds the article in the sitemap and the author on the article', async () => {
    const results = await runChecks(TARGET, fakeServer())
    expect(results.find((r) => r.name === 'article page answers 200')?.detail).toContain(ARTICLE)
    expect(results.find((r) => r.name === 'author page answers 200')?.detail).toContain(AUTHOR)
  })

  it('the image check can be skipped for the sandbox, and then is not run at all', async () => {
    const results = await runChecks({ ...TARGET, imageCheck: false }, fakeServer({ imageStatus: 404 }))
    expect(results.filter((r) => !r.ok)).toEqual([])
    expect(results.some((r) => /image/.test(r.name))).toBe(false)
  })

  it('allows the hosts under test themselves, even when they are *.localhost (the sandbox)', () => {
    const html = '<a href="http://app.readiness.localhost:3100/x"></a><a href="http://localhost:4000/y"></a>'
    expect(loopbackAddresses(html, ['app.readiness.localhost:3100', 'api.readiness.localhost:4100'])).toEqual(['http://localhost:4000'])
  })

  it('reads canonical and og:url however the attributes are ordered', () => {
    expect(pageAddresses('<link href="https://a.test/x" rel="canonical"><meta content="https://a.test/y" property="og:url">')).toEqual({
      canonical: 'https://a.test/x',
      ogUrl: 'https://a.test/y',
    })
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

  it('the bypass probe asks a locked route, not the health pair the app answers without the secret', async () => {
    const asked: string[] = []
    const server = fakeServer({ bypassStatus: 403 })
    await runChecks({ ...TARGET, bypassOrigin: 'https://bypass.example.test' }, ((input: string | URL | Request, init?: RequestInit) => {
      asked.push(String(input))
      return server(input, init)
    }) as typeof fetch)
    expect(asked.filter((url) => url.startsWith('https://bypass.example.test'))).toEqual(['https://bypass.example.test/api/me'])
  })

  describe('the front door (plan item 10)', () => {
    const target = { originEdge: 'https://edge.example.test' }
    const edge = (answer: (headers: Record<string, string>) => { status: number } | 'unreachable') => {
      const seen: Array<{ url: string; hostName: string; headers: Record<string, string> }> = []
      const impl: EdgeRequest = async (url, init) => {
        seen.push({ url, hostName: init.hostName, headers: init.headers ?? {} })
        return answer(init.headers ?? {})
      }
      return { impl, seen }
    }
    const run = async (impl: EdgeRequest) =>
      (await runChecks({ ...TARGET, ...target }, fakeServer(), impl)).filter((r) => r.group === 'front door')

    it('passes when the edge refuses both callers, and names the API host to it', async () => {
      const { impl, seen } = edge(() => ({ status: 403 }))
      const results = await run(impl)
      expect(results.map((r) => r.ok)).toEqual([true, true])
      expect(seen.map((s) => [s.url, s.hostName])).toEqual([
        ['https://edge.example.test/api/me', 'api.example.test'],
        ['https://edge.example.test/api/me', 'api.example.test'],
      ])
      expect(seen[0]!.headers['x-questura-origin-auth']).toBeUndefined()
      expect(seen[0]!.headers['cf-connecting-ip']).toBeDefined()
      expect(seen[1]!.headers['x-questura-origin-auth']).toBe('launch-verify-not-the-secret')
    })

    it('fails when the edge serves a caller who skipped Cloudflare', async () => {
      expect((await run(edge(() => ({ status: 200 })).impl)).map((r) => r.ok)).toEqual([false, false])
      expect((await run(edge((h) => ({ status: h['x-questura-origin-auth'] ? 200 : 403 })).impl)).map((r) => r.ok)).toEqual([true, false])
    })

    it('does not count an unreachable edge as locked: only a refusal proves it', async () => {
      const results = await run(edge(() => 'unreachable').impl)
      expect(results.map((r) => r.ok)).toEqual([false, false])
      expect(results[0]!.detail).toContain('check the address')
    })

    it('is not run without --origin-edge', async () => {
      const results = await runChecks(TARGET, fakeServer(), edge(() => ({ status: 200 })).impl)
      expect(results.some((r) => r.group === 'front door')).toBe(false)
    })
  })

  it('the rate-limit probe fails when forged addresses buy fresh budgets', async () => {
    expect(await failures({ rateLimited: true }, { rateLimitProbe: true })).toEqual([])
    expect(await failures({ rateLimited: false }, { rateLimitProbe: true })).toEqual([
      'forged address headers do not buy a fresh plans budget (31st → 429)',
    ])
  })
})
