/**
 * Launch-day checks, run against the real platform over HTTP.
 *
 * Every check here is read-only: GETs, OPTIONS, and POSTs that are refused
 * before they touch anything (no cookie, a foreign Origin, no Stripe
 * signature). Nothing signs in, buys, or writes. Two things go further: the
 * rate-limit probe spends one caller's budget, and the signed-in cookie check
 * reads a dedicated test account's session (`LAUNCH_VERIFY_COOKIE`, passed at
 * run time, never committed).
 *
 * Only an answer proves a lock. A DNS, TLS or connection error on a lockdown
 * probe is reported as "unknown" and fails: a typo in the address must not
 * read as "locked down" (launch fix plan item 6).
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
  /**
   * Where a caller who skips Cloudflare connects: the target the API's DNS
   * record points Cloudflare at (Railway's edge for the custom domain), or
   * the backend's own port in the sandbox. Requests there name the API's
   * host (Host header and TLS SNI) and carry no origin secret, and must be
   * refused (ADR-0016, launch fix plan item 10).
   */
  originEdge?: string
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
   * `--no-image-check` exists for a sandbox started without its fixture
   * media server; since launch fix plan item 8 the stack serves real images.
   */
  imageCheck?: boolean
  /**
   * Sandbox only (`--local --media`): the fixture media server's host, the
   * one loopback name besides the site and the API a page may contain.
   */
  mediaHost?: string
  /**
   * A dedicated test account's session, as a Cookie header holding only the
   * session token (`options.ts`), and whether that account is a member now.
   * Read from `LAUNCH_VERIFY_COOKIE` at run time; never committed or logged.
   */
  cookie?: { header: string; member: boolean }
  /** `LOAD_TEST_KEY` is set in the environment running the checks (never its value). */
  loadTestKeyInShell?: boolean
}

export type Result = { group: string; name: string; ok: boolean; detail: string }

type Fetch = typeof fetch

/** One request to `url`, presenting `hostName` as the host (Host header and SNI). */
export type EdgeRequest = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; hostName: string },
) => Promise<{ status: number } | { error: string }>

const TLS_CODE = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_(?:GET|VERIFY)|ERR_TLS|HOSTNAME|ALTNAME|EPROTO/i

/**
 * Why a request got no answer, in words that say which kind of mistake to
 * look for: a wrong name (DNS), a certificate or handshake problem (TLS), or
 * nothing listening. Every one of them is "unknown", never "locked".
 */
export function describeNetworkError(error: unknown): string {
  const seen = new Set<unknown>()
  let current: unknown = error
  let code = ''
  let message = ''
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const { code: c, name, message: m, cause } = current as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown }
    if (!code && typeof c === 'string') code = c
    if (!code && (name === 'TimeoutError' || name === 'AbortError')) code = 'TIMEOUT'
    if (typeof m === 'string' && m) message = m
    current = cause
  }
  if (!code && typeof error === 'string') message = error
  const said = [code, message].filter(Boolean).join(': ') || 'no answer'
  if (/^(?:ENOTFOUND|EAI_AGAIN|EAI_NODATA|EAI_NONAME)$/.test(code)) return `DNS (${said})`
  if (TLS_CODE.test(code)) return `TLS (${said})`
  if (code === 'ECONNREFUSED') return `connection refused (${said})`
  if (code === 'TIMEOUT' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return `timed out (${said})`
  return said
}

export const edgeRequest: EdgeRequest = async (url, init) => {
  const { request: httpRequest } = await import('node:http')
  const { request: httpsRequest } = await import('node:https')
  const target = new URL(url)
  const secure = target.protocol === 'https:'
  const send = secure ? httpsRequest : httpRequest
  return new Promise((resolvePromise) => {
    const req = send(
      {
        host: target.hostname,
        port: target.port || (secure ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: init.method ?? 'GET',
        headers: { ...init.headers, host: init.hostName },
        // Presented as the API's name, and the certificate is not held
        // against us: a caller skipping Cloudflare ignores it too, and what
        // this asks is whether the edge serves them, not whether it is
        // trusted. No secret is sent. A failed handshake is still "unknown".
        ...(secure ? { servername: init.hostName.replace(/:\d+$/, ''), rejectUnauthorized: false } : {}),
      },
      (res) => {
        res.resume()
        resolvePromise({ status: res.statusCode ?? 0 })
      },
    )
    req.setTimeout(10_000, () => req.destroy(Object.assign(new Error('no answer in 10 s'), { code: 'TIMEOUT' })))
    req.on('error', (error) => resolvePromise({ error: describeNetworkError(error) }))
    req.end()
  })
}

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

export async function runChecks(target: Target, fetchImpl: Fetch = fetch, edgeImpl: EdgeRequest = edgeRequest): Promise<Result[]> {
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

  // --- Load identity (decision D3, launch fix plan item 9) ----------------------
  // A load-test key is a deliberate bypass of the per-address limits, for one
  // approved window. Launch is not verified while one is set: on the API
  // (`/api/health/ready` says `loadIdentity: "off"`, and an API too old to say
  // is not assumed off) or in the shell running this, where it is left over
  // from driving the test.
  const readyBody = (await ready.clone().json().catch(() => null)) as { loadIdentity?: unknown } | null
  record(
    'load test',
    'the API has no load-test key set (load identity off)',
    readyBody?.loadIdentity === 'off',
    `loadIdentity=${JSON.stringify(readyBody?.loadIdentity ?? 'not reported')}; remove LOAD_TEST_KEY and LOAD_TEST_UNTIL from the API and redeploy`,
  )
  record(
    'load test',
    'this shell has no LOAD_TEST_KEY',
    !target.loadTestKeyInShell,
    target.loadTestKeyInShell ? 'LOAD_TEST_KEY is set here: unset it, the test window is over' : 'unset',
  )

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
    // Not /api/health/ready: the app answers the health pair without the
    // origin secret (Railway's healthcheck calls it on the container), so
    // only a route the lock covers says whether the API is served.
    //
    // Only a 4xx proves it. A deleted *.up.railway.app domain still answers
    // Railway's own 404 at its edge; a DNS or TLS error means the address is
    // wrong (a typo used to count as "locked down"), so it is "unknown".
    let status: number | null = null
    let unknown = ''
    try {
      const direct = await get(fetchImpl, `${target.bypassOrigin}/api/me`, { signal: AbortSignal.timeout(10_000) })
      status = direct.status
      await direct.body?.cancel().catch(() => undefined)
    } catch (error) {
      unknown = describeNetworkError(error)
    }
    record(
      'lockdown',
      `the platform origin ${target.bypassOrigin} does not serve the API`,
      status !== null && status >= 400 && status < 500,
      status !== null ? `HTTP ${status}` : `unknown: ${unknown}. Check the address; only a 4xx answer proves the lock`,
    )
  }

  // --- Front door (ADR-0016, launch fix plan item 10) ---------------------------
  // The API's DNS record points Cloudflare at Railway's edge, which routes by
  // host name. Anyone can connect there, name the API and skip Cloudflare,
  // forged CF-Connecting-IP included. The edge rule and the app must refuse.
  if (target.originEdge) {
    const hostName = new URL(target.api).host
    for (const [label, headers] of [
      ['a caller who skips Cloudflare is refused (no origin header, forged CF-Connecting-IP)', { 'cf-connecting-ip': '203.0.113.7' }],
      ['a caller with a wrong origin header is refused', { 'x-questura-origin-auth': 'launch-verify-not-the-secret', 'cf-connecting-ip': '203.0.113.8' }],
    ] as const) {
      const answer = await edgeImpl(`${target.originEdge}/api/me`, { headers: { ...headers, origin: target.client }, hostName })
      record(
        'front door',
        label,
        'status' in answer && answer.status === 403,
        'status' in answer
          ? `HTTP ${answer.status} from ${target.originEdge} as ${hostName}`
          : `unknown: ${answer.error} at ${target.originEdge} as ${hostName}. Check the address; only a refusal proves the lock`,
      )
    }
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

  // --- Signed-in cookie (B6, opt-in: LAUNCH_VERIFY_COOKIE) ------------------------
  if (target.cookie) await cookieChecks(target, target.cookie, fetchImpl, record)

  return results
}

/**
 * What an all-green result did not cover, so the summary can say so. Only
 * `--local` (the sandbox) may leave out the lockdown and rate-limit checks
 * (`options.ts`); the image and cookie checks may be left out anywhere, and
 * are named here every time they are.
 */
export function notRun(target: Target): string[] {
  const missing: string[] = []
  if (!target.bypassOrigin) missing.push('the platform-origin lockdown check (--bypass)')
  if (!target.originEdge) missing.push('the front-door check (--edge-ip or --origin-edge)')
  if (!target.rateLimitProbe) missing.push('the rate-limit probe (--rate-limit-probe)')
  if (target.imageCheck === false) missing.push('the image check (--no-image-check; never skip it against the real site)')
  if (!target.cookie) missing.push('the signed-in cookie check (LAUNCH_VERIFY_COOKIE)')
  return missing
}

type SetCookie = { name: string; attributes: Map<string, string> }

/** Every `Set-Cookie` on a response, split into name and lower-cased attributes. */
export function setCookies(response: Response): SetCookie[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const lines = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ?? '').split(/,(?=\s*[^;,=\s]+=)/)
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const [pair = '', ...rest] = line.split(';')
      const attributes = new Map<string, string>()
      for (const attribute of rest) {
        const at = attribute.indexOf('=')
        const key = (at < 0 ? attribute : attribute.slice(0, at)).trim().toLowerCase()
        if (key) attributes.set(key, at < 0 ? '' : attribute.slice(at + 1).trim())
      }
      return { name: pair.slice(0, pair.indexOf('=')).trim(), attributes }
    })
}

/**
 * The signed-in cookie contract, with a dedicated test account's session.
 *
 * The session token alone is sent to Better Auth's get-session, so the
 * 5-minute cache cookie is missing and the server issues a fresh one: that
 * `Set-Cookie` is where the attributes are visible. The visitor cookies are
 * host-only on the API host (no `Domain`): the site reads membership through
 * `/api/me` with credentials, never from the cookie, so no other host needs
 * it (live-checks/visitor-auth.html, PR #650).
 */
async function cookieChecks(target: Target, cookie: { header: string; member: boolean }, fetchImpl: Fetch, record: Record_): Promise<void> {
  const group = 'cookie'
  const headers = { origin: target.client, cookie: cookie.header }

  const session = await get(fetchImpl, `${target.api}/api/visitor-auth/get-session`, { headers })
  const sessionBody = (await session.json().catch(() => null)) as { session?: unknown; user?: unknown } | null
  record(group, 'the test account’s cookie is a live session', session.status === 200 && Boolean(sessionBody?.session && sessionBody?.user), `HTTP ${session.status}${sessionBody?.user ? '' : ': no session (sign the test account in again and copy a fresh cookie)'}`)

  const issued = setCookies(session).filter((c) => /questura_visitor\./.test(c.name))
  const names = issued.map((c) => c.name).join(', ') || 'none'
  const every = (test: (c: SetCookie) => boolean) => issued.length > 0 && issued.every(test)
  const describe = (read: (c: SetCookie) => string) => issued.map((c) => `${c.name}: ${read(c)}`).join('; ') || 'no questura_visitor Set-Cookie on get-session (send the session token alone, not the session_data cookie)'
  record(group, 'visitor cookies are named __Secure-', every((c) => c.name.startsWith('__Secure-')), names)
  record(group, 'visitor cookies are HttpOnly', every((c) => c.attributes.has('httponly')), describe((c) => (c.attributes.has('httponly') ? 'HttpOnly' : 'missing HttpOnly')))
  record(group, 'visitor cookies are Secure', every((c) => c.attributes.has('secure')), describe((c) => (c.attributes.has('secure') ? 'Secure' : 'missing Secure')))
  record(group, 'visitor cookies are SameSite=Lax', every((c) => (c.attributes.get('samesite') ?? '').toLowerCase() === 'lax'), describe((c) => `SameSite=${c.attributes.get('samesite') ?? 'missing'}`))
  record(group, `visitor cookies are host-only on ${new URL(target.api).host} (no Domain)`, every((c) => !c.attributes.has('domain')), describe((c) => (c.attributes.has('domain') ? `Domain=${c.attributes.get('domain')}` : 'host-only')))

  const me = await get(fetchImpl, `${target.api}/api/me`, { headers })
  const meBody = (await me.json().catch(() => null)) as { authenticated?: boolean; principal?: { membership?: { active?: boolean; status?: string } } | null } | null
  record(group, '/api/me with the cookie says signed in', me.status === 200 && meBody?.authenticated === true, `HTTP ${me.status} authenticated=${meBody?.authenticated}`)
  record(group, 'signed-in /api/me is no-store', /no-store/i.test(header(me, 'cache-control')), header(me, 'cache-control') || 'missing')
  record(group, 'signed-in /api/me varies on Cookie', /cookie/i.test(header(me, 'vary')), header(me, 'vary') || 'missing')
  const active = meBody?.principal?.membership?.active
  record(
    group,
    `the test account reads as ${cookie.member ? 'a member' : 'not a member'} (LAUNCH_VERIFY_COOKIE_MEMBER)`,
    active === cookie.member,
    `membership.active=${active} status=${meBody?.principal?.membership?.status}`,
  )
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
  const allowed = [client.host, api.host, ...(target.mediaHost ? [target.mediaHost] : [])]

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
  'First real purchase, only with the owner’s yes: live-checks/launch-purchase.html (purchase → cancel → reactivate → cancel → refund)',
]
