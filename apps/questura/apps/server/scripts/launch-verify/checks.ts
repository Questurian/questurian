/**
 * Launch-day checks, run against the real platform over HTTP.
 *
 * Every check here is read-only: GETs, OPTIONS, and POSTs that are refused
 * before they touch anything (no cookie, a foreign Origin, no Stripe
 * signature). Nothing signs in, buys, or writes. The two things that need
 * more than that (a signed-in cookie check with a test account, and the
 * rate-limit probe that spends one caller's budget) are opt-in and say so.
 *
 * The same checks run against the readiness sandbox before launch
 * (`--allow-http`), which is how they are proven to pass before they matter.
 */

export type Target = {
  /** The site origin, e.g. https://www.questurian.com */
  client: string
  /** The API origin, e.g. https://api.questurian.com */
  api: string
  /** A platform-generated origin that must not serve the API (C2). */
  bypassOrigin?: string
  /** Advertised catalog prices, in cents. */
  expectPrices: { monthly: number; yearly: number }
  allowHttp: boolean
  /** Opt-in: spend one caller's plans budget to prove forged IPs do not rotate it. */
  rateLimitProbe: boolean
  /**
   * The page the home check loads. Default `/`, which redirects to the
   * default city (`/peru/lima`, client `app/(public)/page.tsx`); that city
   * has to exist on the platform, so the redirect is followed and must land
   * on a 200. The readiness sandbox has only its own test cities.
   */
  homePath?: string
  /** The article page the host checks load. Default: the first article in the sitemap. */
  articlePath?: string
  /** The author page the host checks load. Default: the first author link on the article. */
  authorPath?: string
  /**
   * Load one image from the home page and expect 200 image/*. Default on.
   * Off only for the readiness sandbox, which has no image CDN until launch
   * fix plan item 8 points it at its fixture media server.
   */
  imageCheck?: boolean
}

export type Result = { group: string; name: string; ok: boolean; detail: string }

type Fetch = typeof fetch

const PAYMENT_POST_ROUTES = [
  'create-checkout-session',
  'create-portal-session',
  'cancel-subscription',
  'reactivate-subscription',
]

async function get(fetchImpl: Fetch, url: string, init: RequestInit = {}): Promise<Response> {
  return fetchImpl(url, { redirect: 'manual', ...init })
}

function header(response: Response, name: string): string {
  return response.headers.get(name) ?? ''
}

export async function runChecks(target: Target, fetchImpl: Fetch = fetch): Promise<Result[]> {
  const results: Result[] = []
  const record = (group: string, name: string, ok: boolean, detail = '') =>
    results.push({ group, name, ok, detail })

  // --- Transport ---------------------------------------------------------------
  for (const [label, origin] of [['client', target.client], ['api', target.api]] as const) {
    const url = new URL(origin)
    record('transport', `${label} origin is https`, target.allowHttp || url.protocol === 'https:', origin)
  }

  // --- Health -------------------------------------------------------------------
  const ready = await get(fetchImpl, `${target.api}/api/health/ready`)
  record('health', 'API /api/health/ready answers 200', ready.status === 200, `HTTP ${ready.status}`)

  // The root redirects to a default city; follow it, but only on this site.
  const home = await fetchImpl(`${target.client}${target.homePath ?? '/'}`, { redirect: 'follow' })
  const landedOn = home.url ? new URL(home.url).origin : new URL(target.client).origin
  record(
    'health',
    'site home page answers 200 on this site',
    home.status === 200 && landedOn === new URL(target.client).origin,
    `HTTP ${home.status} at ${home.url || target.client}`,
  )

  // --- Hosts: the built site points at the real site and API --------------------
  await hostChecks(target, fetchImpl, await home.clone().text().catch(() => ''), home.url || `${target.client}${target.homePath ?? '/'}`, record)

  // --- Headers (D4, B6) ---------------------------------------------------------
  if (!target.allowHttp) {
    for (const [label, response] of [['site', home], ['API', ready]] as const) {
      const hsts = header(response, 'strict-transport-security')
      const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0)
      record('headers', `${label} sends HSTS with max-age ≥ 180 days`, maxAge >= 15_552_000, hsts || 'missing')
    }
  }
  const framing = `${header(home, 'content-security-policy')} ${header(home, 'x-frame-options')}`
  record(
    'headers',
    'site refuses to be framed (frame-ancestors or X-Frame-Options)',
    /frame-ancestors|deny|sameorigin/i.test(framing),
    framing.trim() || 'neither header present',
  )

  // A response a CDN may cache must never set a cookie: the cached copy would
  // hand one visitor's cookie to everyone.
  for (const [label, response] of [['site home', home]] as const) {
    const cacheable = /public|s-maxage/i.test(header(response, 'cache-control'))
    const setsCookie = response.headers.has('set-cookie')
    record('headers', `${label}: no Set-Cookie on a cacheable response`, !(cacheable && setsCookie), `cache-control=${header(response, 'cache-control')} set-cookie=${setsCookie}`)
  }

  // --- Plans (A9) ----------------------------------------------------------------
  const plans = await get(fetchImpl, `${target.api}/api/payments/plans`, { headers: { origin: target.client } })
  let planBody: unknown = null
  try {
    planBody = await plans.json()
  } catch {
    // reported below
  }
  // Every numeric `amount` anywhere in the response: the catalog price in cents.
  const found: number[] = []
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(collect)
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'amount' && typeof value === 'number') found.push(value)
        else collect(value)
      }
    }
  }
  collect(planBody)
  const amounts = `amounts=${JSON.stringify(found)}`
  record('plans', '/api/payments/plans answers 200', plans.status === 200, `HTTP ${plans.status}`)
  record(
    'plans',
    `plans list the advertised monthly price (${target.expectPrices.monthly}¢)`,
    found.includes(target.expectPrices.monthly),
    amounts,
  )
  record(
    'plans',
    `plans list the advertised yearly price (${target.expectPrices.yearly}¢)`,
    found.includes(target.expectPrices.yearly),
    amounts,
  )

  // --- Anonymous and foreign callers (A6) -----------------------------------------
  const me = await get(fetchImpl, `${target.api}/api/me`, { headers: { origin: target.client } })
  const meBody = (await me.json().catch(() => null)) as { authenticated?: boolean } | null
  record('private', '/api/me without a cookie says signed out', me.status === 200 && meBody?.authenticated === false, `HTTP ${me.status} ${JSON.stringify(meBody)}`)
  record('private', '/api/me is no-store', /no-store/i.test(header(me, 'cache-control')), header(me, 'cache-control') || 'missing')
  record('private', '/api/me varies on Cookie', /cookie/i.test(header(me, 'vary')), header(me, 'vary') || 'missing')

  const details = await get(fetchImpl, `${target.api}/api/payments/subscription-details`, { headers: { origin: target.client } })
  record('private', 'subscription-details without a cookie → 401', details.status === 401, `HTTP ${details.status}`)

  for (const route of PAYMENT_POST_ROUTES) {
    const anonymous = await get(fetchImpl, `${target.api}/api/payments/${route}`, {
      method: 'POST',
      headers: { origin: target.client, 'content-type': 'application/json' },
      body: '{}',
    })
    record('payments', `${route} without a cookie → 401`, anonymous.status === 401, `HTTP ${anonymous.status}`)

    // A made-up cookie is enough to make the Origin rule apply; the session
    // behind it is never looked up.
    const foreign = await get(fetchImpl, `${target.api}/api/payments/${route}`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', cookie: 'questura_visitor.session_token=launch-verify', 'content-type': 'text/plain' },
      body: '{}',
    })
    record(
      'payments',
      `${route} from a foreign origin → 403, not reflected`,
      foreign.status === 403 && !foreign.headers.get('access-control-allow-origin'),
      `HTTP ${foreign.status} ACAO=${foreign.headers.get('access-control-allow-origin')}`,
    )
  }

  const preflight = await get(fetchImpl, `${target.api}/api/payments/create-checkout-session`, {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
  })
  record('payments', 'CORS preflight from a foreign origin is not allowed', !preflight.headers.get('access-control-allow-origin'), `ACAO=${preflight.headers.get('access-control-allow-origin')}`)

  // --- Webhook endpoint (A1) -----------------------------------------------------
  const unsigned = await get(fetchImpl, `${target.api}/api/payments/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"id":"evt_launch_verify","object":"event"}',
  })
  record('webhook', 'an unsigned delivery → 400', unsigned.status === 400, `HTTP ${unsigned.status}`)

  const forged = await get(fetchImpl, `${target.api}/api/payments/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
    body: '{"id":"evt_launch_verify","object":"event"}',
  })
  record('webhook', 'a forged signature → 400', forged.status === 400, `HTTP ${forged.status}`)

  // --- Origin lockdown (C2, ADR-0016) -------------------------------------------
  if (target.bypassOrigin) {
    let status = 'unreachable'
    try {
      const direct = await get(fetchImpl, `${target.bypassOrigin}/api/health/ready`, { signal: AbortSignal.timeout(10_000) })
      status = `HTTP ${direct.status}`
    } catch {
      // unreachable is the pass
    }
    record('lockdown', `the platform origin ${target.bypassOrigin} does not serve the API`, status === 'unreachable' || /HTTP 4\d\d/.test(status), status)
  }

  // --- Rate-limit probe (B3, opt-in) ---------------------------------------------
  if (target.rateLimitProbe) {
    // Plans allows 30 a minute per caller. Through a proxy that overwrites the
    // header, 31 requests with 31 forged addresses are still one caller.
    let last = 0
    for (let attempt = 0; attempt <= 30; attempt += 1) {
      const response = await get(fetchImpl, `${target.api}/api/payments/plans`, {
        headers: { 'cf-connecting-ip': `203.0.113.${attempt + 1}`, 'x-forwarded-for': `198.51.100.${attempt + 1}`, 'x-real-ip': `192.0.2.${attempt + 1}` },
      })
      last = response.status
    }
    // Only meaningful through the real proxy, which overwrites the header. At
    // an origin reached directly (the readiness sandbox, or an unlocked
    // Railway host) this fails by design: that is the hole ADR-0016 closes.
    record('rate-limit', 'forged address headers do not buy a fresh plans budget (31st → 429)', last === 429, `last HTTP ${last}; if this is the origin itself, see ADR-0016`)
  }

  return results
}

type Record_ = (group: string, name: string, ok: boolean, detail?: string) => void

// Any address on the machine that built or runs the site. Visitors cannot
// reach it, so one in a page means a build or setting was missing.
const LOOPBACK = /(?:https?:)?\/\/((?:[a-z0-9-]+\.)*localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?(?![a-z0-9.-])/gi

/** Loopback addresses in `html`, except the hosts under test (the sandbox's own *.localhost names). */
export function loopbackAddresses(html: string, allowedHosts: string[]): string[] {
  const found = new Set<string>()
  for (const match of html.matchAll(LOOPBACK)) {
    let host = ''
    try {
      host = new URL(match[0].startsWith('//') ? `http:${match[0]}` : match[0]).host
    } catch {
      // keep it: unparsable is still an address on this machine
    }
    if (!allowedHosts.includes(host)) found.add(match[0])
  }
  return [...found]
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return match ? (match[2] ?? match[3] ?? '').replace(/&amp;/g, '&') : null
}

/** `<link rel="canonical">` and `<meta property="og:url">` hrefs, as written. */
export function pageAddresses(html: string): { canonical: string | null; ogUrl: string | null } {
  let canonical: string | null = null
  let ogUrl: string | null = null
  for (const [tag] of html.matchAll(/<(?:link|meta)\b[^>]*>/gi)) {
    if (canonical === null && /\srel\s*=\s*["']?canonical\b/i.test(tag)) canonical = attribute(tag, 'href')
    if (ogUrl === null && /\sproperty\s*=\s*["']og:url["']/i.test(tag)) ogUrl = attribute(tag, 'content')
  }
  return { canonical, ogUrl }
}

function absoluteOn(value: string | null, host: string): boolean {
  if (!value || !/^https?:\/\//i.test(value)) return false
  try {
    return new URL(value).host === host
  } catch {
    return false
  }
}

async function text(fetchImpl: Fetch, url: string): Promise<{ status: number; body: string; type: string }> {
  try {
    const response = await fetchImpl(url, { redirect: 'follow' })
    return { status: response.status, body: await response.text(), type: header(response, 'content-type') }
  } catch (error) {
    return { status: 0, body: '', type: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * What a build or setting that is wrong would leave in the served site:
 * loopback addresses in pages, canonicals naming another host (a workers.dev
 * copy canonicalising to itself), a sitemap for the wrong host, images from a
 * host that serves nothing, and a bundle calling some other API.
 */
async function hostChecks(target: Target, fetchImpl: Fetch, homeHtml: string, homeUrl: string, record: Record_): Promise<void> {
  const client = new URL(target.client)
  const api = new URL(target.api)
  const allowed = [client.host, api.host]

  const robots = await text(fetchImpl, `${target.client}/robots.txt`)
  const sitemapLines = [...robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((match) => match[1]!)
  record(
    'hosts',
    '/robots.txt answers 200 and names only this site’s sitemap',
    robots.status === 200 && sitemapLines.length > 0 && sitemapLines.every((line) => absoluteOn(line, client.host)),
    `HTTP ${robots.status} sitemap=${JSON.stringify(sitemapLines)}`,
  )

  const sitemap = await text(fetchImpl, `${target.client}/sitemap.xml`)
  const locs = [...sitemap.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1]!.replace(/&amp;/g, '&'))
  const foreign = locs.filter((loc) => !absoluteOn(loc, client.host))
  record(
    'hosts',
    '/sitemap.xml answers 200 and lists only this site',
    sitemap.status === 200 && locs.length > 0 && foreign.length === 0,
    `HTTP ${sitemap.status}, ${locs.length} urls${foreign.length ? `, other hosts: ${foreign.slice(0, 3).join(' ')}` : ''}`,
  )

  const articlePath =
    target.articlePath ??
    locs
      .filter((loc) => absoluteOn(loc, client.host))
      .map((loc) => new URL(loc).pathname)
      .find((path) => path.split('/').filter(Boolean).length === 4)
  const article = articlePath ? await text(fetchImpl, `${target.client}${articlePath}`) : null
  const authorPath =
    target.authorPath ??
    /href="((?:https?:\/\/[^"/]+)?\/authors\/[^"?#]+)"/.exec(`${article?.body ?? ''} ${homeHtml}`)?.[1]?.replace(/^https?:\/\/[^/]+/, '')
  const author = authorPath ? await text(fetchImpl, `${target.client}${authorPath}`) : null

  const pages: Array<[string, string | undefined, { status: number; body: string } | null]> = [
    ['home', target.homePath ?? '/', { status: 200, body: homeHtml }],
    ['article', articlePath, article],
    ['author', authorPath, author],
  ]
  for (const [label, path, page] of pages) {
    if (!page || !path) {
      record('hosts', `${label} page found`, false, label === 'article' ? 'no 4-segment URL in the sitemap; pass --article' : 'no /authors/ link on the article; pass --author')
      continue
    }
    if (label !== 'home') record('hosts', `${label} page answers 200`, page.status === 200, `HTTP ${page.status} at ${path}`)
    const loopback = loopbackAddresses(page.body, allowed)
    record('hosts', `${label} page has no localhost or 127.0.0.1 address`, loopback.length === 0, loopback.slice(0, 5).join(' ') || path)
    const { canonical, ogUrl } = pageAddresses(page.body)
    record('hosts', `${label} page canonical is absolute on ${client.host}`, absoluteOn(canonical, client.host), `canonical=${canonical ?? 'missing'} at ${path}`)
    record('hosts', `${label} page og:url, if any, is absolute on ${client.host}`, ogUrl === null || absoluteOn(ogUrl, client.host), `og:url=${ogUrl}`)
  }

  const missing = await text(fetchImpl, `${target.client}/launch-verify-${Date.now().toString(36)}/no-such-page`)
  record('hosts', 'a made-up path answers 404', missing.status === 404, `HTTP ${missing.status}`)

  if (target.imageCheck !== false) {
    const src = [...homeHtml.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => attribute(tag, 'src')).find((value) => value && !value.startsWith('data:'))
    let detail = 'no <img src> on the home page'
    let ok = false
    if (src) {
      const image = await fetchImpl(new URL(src, homeUrl).toString(), { redirect: 'follow' }).catch((error: unknown) => error)
      if (image instanceof Response) {
        ok = image.status === 200 && /^image\//i.test(header(image, 'content-type'))
        detail = `HTTP ${image.status} ${header(image, 'content-type')} ${src}`
        await image.body?.cancel().catch(() => undefined)
      } else {
        detail = `${image instanceof Error ? image.message : String(image)}: ${src}`
      }
    }
    record('hosts', 'one image on the home page loads (200 image/*)', ok, detail)
  }

  // The API address is baked into the JavaScript at build time. The page can
  // be right while the bundle calls some other API, or localhost.
  const scripts = [...homeHtml.matchAll(/<script\b[^>]*\ssrc="([^"]+\.js[^"]*)"/gi)].map((match) => new URL(match[1]!.replace(/&amp;/g, '&'), homeUrl).toString())
  let carrier = ''
  for (const url of scripts.slice(0, 60)) {
    const chunk = await text(fetchImpl, url)
    if (chunk.body.includes(api.origin)) {
      carrier = new URL(url).pathname
      break
    }
  }
  record('hosts', `a script the home page loads calls ${api.origin}`, carrier !== '', carrier || `none of ${scripts.length} scripts mention it`)
}

/** What cannot be checked over anonymous HTTP. Printed after the run. */
export const MANUAL_STEPS = [
  'pnpm --dir apps/questura/apps/server verify:stripe-webhook-events   # no MISSING, endpoint not DISABLED',
  'Stripe Dashboard → Webhooks → the new endpoint → recent deliveries all 200',
  'QUESTURA_RECONCILE_APPLY=0 pnpm --dir apps/questura/apps/server reconcile:nightly   # dry run: 0 changes',
  'Signed-in cookie contract (B6): run with LAUNCH_VERIFY_COOKIE_CHECK once a dedicated test account exists',
  'First real purchase, only with the owner’s yes: live-checks/payments.html (platform version)',
]
