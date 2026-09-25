/**
 * The API's front door, locked (ADR-0016, launch fix plan item 10).
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:front-door
 *
 * The stack runs the backend on 4110 with `ORIGIN_AUTH_SECRET` set, and
 * `front-door-edge.ts` on the API's public port 4100 standing in for
 * Cloudflare's Transform Rule (see that file). This checks:
 *
 *  - **The lock.** Straight at 4110, the way a caller who skips Cloudflare
 *    reaches Railway's edge: no header, a wrong one, a forged
 *    `CF-Connecting-IP`, a webhook, Google's callback, the admin panel — all
 *    refused with 403, no-store and a request id. The right header is served.
 *    Both health paths answer without it, because Railway's healthcheck calls
 *    `/api/health/ready` on the container itself.
 *  - **Callers from outside.** Through the door, a Stripe delivery reaches the
 *    signature check (400 unsigned, not 403) and Google's redirect reaches
 *    Better Auth. (`readiness:payments` and `readiness:oauth` deliver signed
 *    events and real sign-ins through the same door.)
 *  - **The site renders.** Every page in the launch route list renders from
 *    the client, whose server-side calls the edge forwards **without** adding
 *    the header — the pessimistic answer to the Worker-subrequest unknown. The
 *    edge's counters must show render calls arriving, all with the key, and
 *    none refused.
 *  - **Never logged.** The secret appears in no stack log.
 */

import { readFileSync, existsSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { randomBytes } from 'node:crypto'

import type { EdgeStats } from './front-door-edge'
import { LAUNCH_MANIFEST_PATH, type LaunchManifest } from './launch-corpus'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { freshRateLimits, readStackState, STACK_PORTS } from './stack'

type Check = { group: string; name: string; ok: boolean; detail: string }
const checks: Check[] = []

function record(group: string, name: string, ok: boolean, detail = ''): void {
  checks.push({ group, name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} [${group}] ${name}${ok ? '' : ` — ${detail}`}`)
}

const EDGE = `http://127.0.0.1:${STACK_PORTS.backend}`
const ORIGIN = `http://127.0.0.1:${STACK_PORTS.origin}`
const CLIENT = `http://127.0.0.1:${STACK_PORTS.client}`
const HEADER = 'x-questura-origin-auth'

type Answer = { status: number; headers: Record<string, string | string[] | undefined>; body: string }

/** A request with the path sent byte for byte (`fetch` would normalise dot segments first). */
function raw(origin: string, path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Answer> {
  const url = new URL(origin)
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest(
      { host: url.hostname, port: url.port, path, method: options.method ?? 'GET', headers: options.headers ?? {} },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      },
    )
    req.setTimeout(30_000, () => req.destroy(new Error(`timeout: ${path}`)))
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function edgeStats(): Promise<EdgeStats> {
  const response = await fetch(`${EDGE}/__edge/stats`)
  return (await response.json()) as EdgeStats
}

function refused(answer: Answer): boolean {
  return answer.status === 403 && /no-store/.test(String(answer.headers['cache-control'] ?? ''))
}

async function main(): Promise<void> {
  assertPreflight(sandboxSettings())
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  const secret = stack.secrets.originAuth
  if (!secret || !stack.processes.some((entry) => entry.role === 'edge')) {
    throw new Error('This stack has no front door (started before launch fix plan item 10). Run `pnpm readiness:stack -- down`, then `up`.')
  }
  await freshRateLimits()
  const manifest = JSON.parse(readFileSync(LAUNCH_MANIFEST_PATH, 'utf8')) as LaunchManifest

  // --- The lock: straight at the backend, as if Cloudflare were skipped -----
  const bare = await raw(ORIGIN, '/api/me', { headers: { 'cf-connecting-ip': '198.51.100.20' } })
  record('lock', 'no header → 403', bare.status === 403, `HTTP ${bare.status}`)
  record('lock', 'the refusal is no-store', /no-store/.test(String(bare.headers['cache-control'] ?? '')), String(bare.headers['cache-control']))
  record('lock', 'the refusal carries a request id', /^[A-Za-z0-9._:-]{8,128}$/.test(String(bare.headers['x-request-id'] ?? '')), String(bare.headers['x-request-id']))
  record('lock', 'the refusal says nothing else', bare.body === '{"error":"Forbidden"}' && !bare.body.includes(secret), bare.body.slice(0, 80))

  const wrongSameLength = await raw(ORIGIN, '/api/me', { headers: { [HEADER]: randomBytes(24).toString('hex') } })
  record('lock', 'a wrong header of the right length → 403', refused(wrongSameLength), `HTTP ${wrongSameLength.status}`)
  const prefix = await raw(ORIGIN, '/api/me', { headers: { [HEADER]: secret.slice(0, 16) } })
  record('lock', 'half of the right header → 403', refused(prefix), `HTTP ${prefix.status}`)
  const forged = await raw(ORIGIN, '/api/payments/plans', { headers: { 'cf-connecting-ip': '203.0.113.99', 'x-forwarded-for': '203.0.113.98' } })
  record('lock', 'a forged CF-Connecting-IP buys nothing: 403', refused(forged), `HTTP ${forged.status}`)
  const right = await raw(ORIGIN, '/api/me', { headers: { [HEADER]: secret } })
  record('lock', 'the right header → served (200, signed out)', right.status === 200 && /"authenticated":false/.test(right.body), `HTTP ${right.status}`)

  for (const path of ['/api/health', '/api/health/ready']) {
    const health = await raw(ORIGIN, path)
    record('lock', `${path} answers without the header (Railway healthcheck)`, health.status === 200, `HTTP ${health.status}`)
  }
  for (const path of ['/api/health/ready/../../me', '/api/health/../me', '/api/healthz']) {
    const sneaky = await raw(ORIGIN, path)
    record('lock', `${path} does not borrow the health exemption`, sneaky.status === 403 || sneaky.status === 404, `HTTP ${sneaky.status}`)
  }

  const locked: Array<[string, string, string, Record<string, string>?, string?]> = [
    ['a Stripe webhook', 'POST', '/api/payments/webhooks/stripe', { 'content-type': 'application/json' }, '{"id":"evt_front_door","object":"event"}'],
    ["Google's sign-in callback", 'GET', '/api/visitor-auth/callback/google?code=x&state=y'],
    ['the admin panel', 'GET', '/admin'],
    ['GraphQL', 'POST', '/api/graphql', { 'content-type': 'application/json' }, '{"query":"{ __typename }"}'],
    ['a CORS preflight', 'OPTIONS', '/api/payments/create-checkout-session', { origin: stack.origins.client, 'access-control-request-method': 'POST' }],
  ]
  for (const [label, method, path, headers, body] of locked) {
    const answer = await raw(ORIGIN, path, { method, headers, body })
    record('lock', `${label} without the header → 403`, refused(answer), `HTTP ${answer.status}`)
  }

  // --- Callers from outside, through the door --------------------------------
  const unsigned = await raw(EDGE, '/api/payments/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"id":"evt_front_door","object":"event"}',
  })
  record('through the door', 'a Stripe delivery reaches the signature check (unsigned → 400)', unsigned.status === 400, `HTTP ${unsigned.status}`)
  const google = await raw(EDGE, '/api/visitor-auth/callback/google?code=x&state=y')
  record('through the door', "Google's redirect reaches Better Auth (not refused)", google.status !== 403 && google.status < 500, `HTTP ${google.status}`)
  const me = await raw(EDGE, '/api/me', { headers: { origin: stack.origins.client } })
  record('through the door', 'a reader reaches the API', me.status === 200, `HTTP ${me.status}`)
  const stolen = await raw(EDGE, '/api/me', { headers: { [HEADER]: 'caller-sent-value' } })
  record('through the door', 'a caller-sent header is replaced by the edge, not trusted', stolen.status === 200, `HTTP ${stolen.status}`)

  // --- The site renders every page in the route list -------------------------
  const before = await edgeStats()
  const published = manifest.pieces.filter((piece) => piece.status === 'published')
  const pages: Array<{ label: string; path: string; expect: number; marker?: string }> = [
    { label: 'country hub', path: `/${published[0]!.path.split('/')[1]}`, expect: 200 },
    ...manifest.cities.map((city) => ({ label: `city ${city.slug}`, path: city.path, expect: 200 })),
    ...published.map((piece) => ({ label: `${piece.type} ${piece.markers.title}`, path: piece.path, expect: 200, marker: piece.markers.title })),
    ...manifest.searches.map((search) => ({ label: `search "${search.q}"`, path: `/search?q=${encodeURIComponent(search.q)}`, expect: 200, marker: search.expectedPaths?.[0] })),
    // A query nobody has asked before: a render the data cache cannot answer.
    { label: 'search for something new', path: `/search?q=zzqq${randomBytes(6).toString('hex')}`, expect: 200 },
    { label: 'sitemap', path: '/sitemap.xml', expect: 200, marker: published[0]!.path },
    // Drafts with a canonical path (articles get theirs on publication).
    ...manifest.pieces.filter((piece) => piece.status === 'draft' && piece.path).map((piece) => ({ label: `draft ${piece.markers.title} stays hidden`, path: piece.path, expect: 404, absent: piece.markers.body })),
    ...manifest.missingPaths.map((path) => ({ label: `missing ${path}`, path, expect: 404 })),
  ]
  // Author pages: the ones the site links to. (The manifest's author slugs
  // are user rows, not the public author profiles the pages link.)
  const authorPaths = new Set<string>()
  const load = async (page: { label: string; path: string; expect: number; marker?: string; absent?: string }) => {
    const response = await fetch(`${CLIENT}${page.path}`, { redirect: 'manual' })
    const html = await response.text()
    for (const match of html.matchAll(/href="(\/authors\/[a-z0-9-]+)"/g)) authorPaths.add(match[1]!)
    const markerOk = page.marker ? html.includes(page.marker) : true
    const leaked = page.absent ? html.includes(page.absent) : false
    // A route with a loading.tsx (itineraries) streams its shell before the
    // page calls notFound(), so the status is already 200: Next then sends the
    // not-found page with noindex. Not a front-door matter, and nothing of the
    // draft is in it; accepted here only with both markers of that path.
    const streamedNotFound =
      page.expect === 404 && response.status === 200 && /<meta name="robots" content="noindex"/.test(html) && html.includes('NEXT_HTTP_ERROR_FALLBACK;404')
    const statusOk = response.status === page.expect || streamedNotFound
    record(
      'renders',
      `${page.label} → ${page.expect}`,
      statusOk && markerOk && !leaked,
      `HTTP ${response.status}${streamedNotFound ? ' (streamed not-found, noindex)' : ''}${page.marker ? `, marker ${markerOk ? 'present' : 'absent'}` : ''}${leaked ? ', DRAFT CONTENT LEAKED' : ''}`,
    )
    if (streamedNotFound) console.log(`        note: ${page.path} is a streamed not-found (HTTP 200 + noindex)`)
  }
  for (const page of pages) await load(page)
  record('renders', 'the pages link to at least one author page', authorPaths.size > 0, `${authorPaths.size} linked`)
  for (const path of [...authorPaths].sort()) await load({ label: `author ${path}`, path, expect: 200 })
  const after = await edgeStats()
  const withKey = after.renders.withKey - before.renders.withKey
  const withoutKey = after.renders.withoutKey - before.renders.withoutKey
  const refusedRenders = after.answered403.renders - before.answered403.renders
  record('renders', 'render calls reached the API while the pages were loaded', withKey > 0, `${withKey} with the key`)
  record('renders', 'every render call carried the key itself (the edge added nothing)', withoutKey === 0, `${withoutKey} without`)
  record('renders', 'no render call was refused', refusedRenders === 0, `${refusedRenders} refused`)
  record('renders', 'since the stack started, no render call ever lacked the key', after.renders.withoutKey === 0 && after.answered403.renders === 0, JSON.stringify(after.renders))

  // The edge really adds nothing to a render: one without its own key is refused.
  const bareRender = await raw(EDGE, '/api/public/articles/by-location?country=zz-launch', {
    headers: { 'x-questura-render-token': stack.secrets.renderToken, 'x-readiness-edge-probe': '1' },
  })
  record('renders', 'a render call without its own key is refused (the stand-in adds nothing to renders)', refused(bareRender), `HTTP ${bareRender.status}`)

  // --- Never logged -----------------------------------------------------------
  for (const role of ['backend', 'client', 'edge']) {
    const log = stack.processes.find((entry) => entry.role === role)?.log
    const text = log && existsSync(log) ? readFileSync(log, 'utf8') : null
    record('logs', `${role}.log never contains the secret`, text !== null && !text.includes(secret), text === null ? 'no log' : 'found')
  }

  const failed = checks.filter((check) => !check.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} front-door checks passed.`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
