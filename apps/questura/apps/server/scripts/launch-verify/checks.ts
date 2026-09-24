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

/** What cannot be checked over anonymous HTTP. Printed after the run. */
export const MANUAL_STEPS = [
  'pnpm --dir apps/questura/apps/server verify:stripe-webhook-events   # no MISSING, endpoint not DISABLED',
  'Stripe Dashboard → Webhooks → the new endpoint → recent deliveries all 200',
  'QUESTURA_RECONCILE_APPLY=0 pnpm --dir apps/questura/apps/server reconcile:nightly   # dry run: 0 changes',
  'Signed-in cookie contract (B6): run with LAUNCH_VERIFY_COOKIE_CHECK once a dedicated test account exists',
  'First real purchase, only with the owner’s yes: live-checks/payments.html (platform version)',
]
