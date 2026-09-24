/**
 * Payment routes against the production build (launch harness A1 + A6).
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:payments
 *
 * The vitest suites (`stripe-webhook-signature.route.test.ts`,
 * `cross-user-and-origin.test.ts`) call the route handlers directly. This asks
 * the same questions of the built server over HTTP, the way Stripe and a
 * browser reach it. What the unit tests cannot see lives here: whatever `next
 * build` and the Node server do to a request body, headers and streaming
 * before the handler runs.
 *
 *  - **Webhook signatures.** Stripe's scheme, signed offline with the
 *    sandbox's own placeholder secret. A valid event is accepted and
 *    recorded once; a duplicate is recognised; every tampered or badly
 *    signed variant is refused; a chunked multi-byte body verifies; an
 *    oversized one is refused before it is buffered.
 *  - **Origin guard.** A signed-in member's cookie, sent to each of the five
 *    cookie-authenticated payment routes, is refused (403) for a missing,
 *    `null`, foreign or look-alike Origin.
 *
 * No real Stripe key exists in the sandbox, and preflight refuses one.
 * Nothing leaves loopback.
 */

import { createHmac } from 'node:crypto'

import { Pool } from 'pg'

import { signIn } from './identities'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { freshRateLimits, readStackState, STACK_PORTS } from './stack'
import { SANDBOX_WEBHOOK_SECRET } from './apps'

const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`
const WEBHOOK = `${BACKEND}/api/payments/webhooks/stripe`

type Check = { group: string; name: string; ok: boolean; detail: string }
const checks: Check[] = []

function record(group: string, name: string, ok: boolean, detail: string): void {
  checks.push({ group, name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} [${group}] ${name}${ok ? '' : ` — ${detail}`}`)
}

const now = () => Math.floor(Date.now() / 1000)

function sign(payload: Buffer | string, secret = SANDBOX_WEBHOOK_SECRET, timestamp = now()): string {
  const v1 = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(payload)]))
    .digest('hex')
  return `t=${timestamp},v1=${v1}`
}

function event(id: string): string {
  return JSON.stringify({
    id,
    object: 'event',
    type: 'customer.updated',
    created: now(),
    livemode: false,
    data: { object: { id: 'cus_readiness', object: 'customer', name: 'Zoë Ångström 🎟️' } },
  })
}

let address = 0
/** A fresh synthetic caller per request, so the harness never meets a rate limit. */
function caller(): Record<string, string> {
  address += 1
  return { 'cf-connecting-ip': `198.18.${Math.floor(address / 250)}.${(address % 250) + 1}` }
}

async function deliver(body: BodyInit, signature: string | null): Promise<Response> {
  return fetch(WEBHOOK, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...caller(),
      ...(signature === null ? {} : { 'stripe-signature': signature }),
    },
    body,
    duplex: 'half',
  } as RequestInit)
}

function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += size) {
        controller.enqueue(bytes.slice(offset, offset + size))
      }
      controller.close()
    },
  })
}

async function webhookChecks(pool: Pool): Promise<void> {
  const group = 'webhook'
  const runId = `evt_readiness_${Date.now()}`

  const body = event(runId)
  const accepted = await deliver(body, sign(body))
  record(group, 'a correctly signed event → 200', accepted.status === 200, `HTTP ${accepted.status}`)

  const rows = await pool.query('SELECT count(*)::int AS n FROM stripe_webhook_events WHERE event_id = $1', [runId])
  record(group, 'the accepted event is recorded exactly once', rows.rows[0]?.n === 1, `rows=${rows.rows[0]?.n}`)

  const again = await deliver(body, sign(body))
  const againBody = (await again.json().catch(() => null)) as { duplicate?: boolean } | null
  record(group, 'a second delivery is recognised as a duplicate', again.status === 200 && againBody?.duplicate === true, `HTTP ${again.status} ${JSON.stringify(againBody)}`)

  const streamedId = `${runId}_streamed`
  const streamed = event(streamedId)
  const streamedResponse = await deliver(chunked(new TextEncoder().encode(streamed), 3), sign(streamed))
  record(group, 'a chunked body with multi-byte characters split across chunks → 200', streamedResponse.status === 200, `HTTP ${streamedResponse.status}`)

  const refused: Array<[string, () => Promise<Response>]> = [
    ['no signature header', () => deliver(event(`${runId}_a`), null)],
    ['another secret', () => { const b = event(`${runId}_b`); return deliver(b, sign(b, 'whsec_someone_else')) }],
    ['one flipped byte', () => {
      const b = Buffer.from(event(`${runId}_c`))
      const signature = sign(b)
      b[b.length - 3] = b[b.length - 3]! ^ 1
      return deliver(new Uint8Array(b), signature)
    }],
    ['the same event pretty-printed', () => { const b = event(`${runId}_d`); return deliver(JSON.stringify(JSON.parse(b), null, 2), sign(b)) }],
    ['a trailing newline added', () => { const b = event(`${runId}_e`); return deliver(`${b}\n`, sign(b)) }],
    ['a replay older than 300 s', () => { const b = event(`${runId}_f`); return deliver(b, sign(b, SANDBOX_WEBHOOK_SECRET, now() - 310)) }],
    ['the right HMAC under v0', () => { const b = event(`${runId}_g`); return deliver(b, sign(b).replace('v1=', 'v0=')) }],
  ]
  for (const [name, send] of refused) {
    const response = await send()
    record(group, `${name} → 400`, response.status === 400, `HTTP ${response.status}`)
  }

  const oversized = await deliver('x'.repeat(1_048_577), sign('x'))
  record(group, 'a body over the 1 MiB cap → 413', oversized.status === 413, `HTTP ${oversized.status}`)

  const leaked = await pool.query("SELECT count(*)::int AS n FROM stripe_webhook_events WHERE event_id LIKE $1 AND event_id <> $2 AND event_id <> $3", [`${runId}_%`, runId, streamedId])
  record(group, 'no refused event was recorded', leaked.rows[0]?.n === 0, `rows=${leaked.rows[0]?.n}`)
}

const COOKIE_ROUTES: Array<[string, 'GET' | 'POST']> = [
  ['create-checkout-session', 'POST'],
  ['create-portal-session', 'POST'],
  ['cancel-subscription', 'POST'],
  ['reactivate-subscription', 'POST'],
  ['subscription-details', 'GET'],
]

async function originChecks(cookie: string, siteOrigin: string): Promise<void> {
  const group = 'origin'
  const site = new URL(siteOrigin)
  const hostile: Array<[string, string | null]> = [
    ['no Origin', null],
    ['Origin: null', 'null'],
    ['a foreign site', 'https://evil.example'],
    ['a suffix look-alike', `${site.protocol}//${site.host}.evil.io`],
    ['another port', `${site.protocol}//${site.hostname}:9`],
  ]

  for (const [route, method] of COOKIE_ROUTES) {
    for (const [label, origin] of hostile) {
      const response = await fetch(`${BACKEND}/api/payments/${route}`, {
        method,
        headers: {
          cookie,
          'content-type': 'text/plain',
          ...caller(),
          ...(origin === null ? {} : { origin }),
        },
        ...(method === 'POST' ? { body: '{"plan":"monthly"}' } : {}),
      })
      const allowOrigin = response.headers.get('access-control-allow-origin')
      record(group, `${route} with ${label} → 403, origin not reflected`, response.status === 403 && allowOrigin === null, `HTTP ${response.status} ACAO=${allowOrigin}`)
    }

    // The member's own site origin is not refused by the guard. What happens
    // next depends on the route and on the sandbox Stripe stub; only "not
    // 403" is asserted here.
    const own = await fetch(`${BACKEND}/api/payments/${route}`, {
      method,
      headers: { cookie, origin: siteOrigin, 'content-type': 'application/json', ...caller() },
      ...(method === 'POST' ? { body: '{"plan":"monthly"}' } : {}),
    })
    record(group, `${route} with the site's own origin passes the guard`, own.status !== 403, `HTTP ${own.status}`)
  }
}

async function main(): Promise<void> {
  const settings = sandboxSettings()
  assertPreflight(settings)
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  // Scripts run back to back share the per-address budgets; start from zero.
  await freshRateLimits()

  const pool = new Pool({ connectionString: settings.databaseUri, max: 2 })
  try {
    await webhookChecks(pool)
    const cookie = await signIn(BACKEND, stack.origins.client, 'member-a@example.com', '198.18.200.1')
    await originChecks(cookie, stack.origins.client)
  } finally {
    await pool.end()
  }

  const failed = checks.filter((check) => !check.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} payment checks passed.`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
