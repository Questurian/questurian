/**
 * Money paths when things fail (launch harness A7), against the production
 * build in the readiness sandbox.
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:faults
 *
 * Stripe faults come from the stub (`/__fake/fault`): a hang, a hang *after*
 * the work was done (only the SDK's idempotency key stops the retry doing it
 * twice), a 500, and a slow answer inside the 8 s budget. Redis and Postgres
 * faults pause the sandbox's own containers, and nothing else: the script
 * refuses any container not named `questura-readiness-*`, and always unpauses.
 *
 * The bar for every fault: a clean answer in bounded time, no second customer
 * or session, nothing recorded that would stop Stripe's retry from working,
 * and public reads staying up when only Redis is gone.
 */

import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'

import { SANDBOX_WEBHOOK_SECRET } from './apps'
import { signIn } from './identities'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { readStackState, STACK_PORTS } from './stack'
import { Pool } from 'pg'

const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`
const STRIPE = `http://127.0.0.1:${STACK_PORTS.stripe}`
const SANDBOX_CONTAINERS = new Set(['questura-readiness-redis', 'questura-readiness-pg'])

type Check = { group: string; name: string; ok: boolean; detail: string }
const checks: Check[] = []
function record(group: string, name: string, ok: boolean, detail = ''): void {
  checks.push({ group, name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} [${group}] ${name}${ok ? '' : ` — ${detail}`}`)
}

/**
 * A gap that is known and waiting on a decision: printed every run, never
 * silently passing, but not failing the run. When it starts passing, say so.
 */
const known: Check[] = []
function recordKnown(group: string, name: string, ok: boolean, detail: string, why: string): void {
  if (ok) return record(group, `${name} (was a known gap: now passing, promote it)`, true)
  known.push({ group, name, ok, detail })
  console.log(` KNOWN [${group}] ${name} — ${detail}. ${why}`)
}

let address = 0
const caller = () => {
  address += 1
  return { 'cf-connecting-ip': `198.21.${Math.floor(address / 250)}.${(address % 250) + 1}` }
}
type Json = Record<string, unknown>

async function control(path: string, body: unknown = {}): Promise<Json> {
  const response = await fetch(`${STRIPE}${path}`, { method: body === null ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, ...(body === null ? {} : { body: JSON.stringify(body) }) })
  return (await response.json()) as Json
}
const state = () => control('/__fake/state', null)
/** POSTs a null fault; `control(path, null)` would be a GET, which clears nothing. */
const clearFault = () =>
  fetch(`${STRIPE}/__fake/fault`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' }).then((r) => r.json())

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now()
  const value = await work()
  return { value, ms: Math.round(performance.now() - started) }
}

function docker(action: 'pause' | 'unpause', container: string): void {
  if (!SANDBOX_CONTAINERS.has(container)) throw new Error(`Refusing to ${action} ${container}: not a sandbox container.`)
  execFileSync('docker', [action, container], { stdio: 'ignore' })
}

function signed(payload: string): string {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${createHmac('sha256', SANDBOX_WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')}`
}

async function main(): Promise<void> {
  const settings = sandboxSettings()
  assertPreflight(settings)
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  const origin = stack.origins.client
  const pool = new Pool({ connectionString: settings.databaseUri, max: 2 })

  const reset = () =>
    pool.query(
      `UPDATE visitor_profiles SET stripe_customer_id = NULL, stripe_subscription_id = NULL, subscription_status = 'none', paid_through_at = NULL, dunning_grace_until = NULL, cancel_at_period_end = false WHERE email = 'nonmember@example.com'`,
    )

  await control('/__fake/reset')
  await clearFault()
  await reset()
  const buyer = await signIn(BACKEND, origin, 'nonmember@example.com', '198.21.250.1')
  const headers = () => ({ cookie: buyer, origin, 'content-type': 'application/json', ...caller() })
  const checkout = () => fetch(`${BACKEND}/api/payments/create-checkout-session`, { method: 'POST', headers: headers(), body: '{"plan":"monthly"}' })
  const sessions = async () => ((await state()).sessions as unknown[]).length
  const customers = async () => ((await state()).customers as unknown[]).length

  try {
    // ------------------------------------------------------------ Stripe
    const g = 'stripe'

    await control('/__fake/fault', { mode: 'slow', ms: 6_500, path: '^POST /v1/checkout/sessions$', times: 1 })
    const slow = await timed(checkout)
    record(g, 'a slow Stripe (6.5 s, inside the 8 s budget) still completes checkout', slow.value.status === 200, `HTTP ${slow.value.status} in ${slow.ms} ms`)

    await control('/__fake/reset')
    await reset()
    await control('/__fake/fault', { mode: 'error', path: '^(GET|POST) /v1/customers', times: 10 })
    const failed = await timed(checkout)
    const failedBody = (await failed.value.json().catch(() => null)) as Json | null
    record(g, 'a Stripe 500 gives a clean error, fast', failed.value.status >= 500 && failed.ms < 5_000 && typeof failedBody?.error === 'string', `HTTP ${failed.value.status} in ${failed.ms} ms ${JSON.stringify(failedBody)}`)
    record(g, '…with no session created', (await sessions()) === 0, `sessions=${await sessions()}`)
    await clearFault()

    await control('/__fake/reset')
    await reset()
    await control('/__fake/fault', { mode: 'hang', path: '^POST /v1/checkout/sessions$', times: 5 })
    const hung = await timed(checkout)
    record(g, 'a Stripe that never answers: checkout gives up in bounded time (under 20 s: 8 s, one retry)', hung.value.status >= 500 && hung.ms < 20_000, `HTTP ${hung.value.status} in ${hung.ms} ms`)
    record(g, '…and leaves no session behind', (await sessions()) === 0, `sessions=${await sessions()}`)
    await clearFault()

    await control('/__fake/reset')
    await reset()
    // One lost answer each: the SDK's retry carries the same Idempotency-Key,
    // so Stripe replays what it already did instead of doing it again.
    await control('/__fake/fault', { mode: 'hang-after', path: '^POST /v1/customers$', times: 1 })
    const lostCustomer = await timed(checkout)
    record(g, 'Stripe created the customer but the answer was lost: the retry replays it', lostCustomer.value.status === 200, `HTTP ${lostCustomer.value.status} in ${lostCustomer.ms} ms`)
    record(g, '…one customer, not two', (await customers()) === 1, `customers=${await customers()}`)

    await control('/__fake/reset')
    await reset()
    await control('/__fake/fault', { mode: 'hang-after', path: '^POST /v1/checkout/sessions$', times: 1 })
    const lostSession = await timed(checkout)
    record(g, 'Stripe created the session but the answer was lost: the retry replays it', lostSession.value.status === 200, `HTTP ${lostSession.value.status} in ${lostSession.ms} ms`)
    record(g, '…one session, not two', (await sessions()) === 1, `sessions=${await sessions()}`)
    await clearFault()

    // A webhook that cannot reach Stripe must fail so Stripe retries, and must
    // not be recorded as processed, or the retry would be skipped as a duplicate.
    const w = 'webhook'
    await control('/__fake/reset')
    await reset()
    const started = (await (await checkout()).json()) as { url?: string }
    const paid = await control(`/__fake/checkout/${String(started.url).split('/').pop()}/complete`, { email: 'nonmember@example.com' })
    const eventId = `evt_fault${randomBytes(6).toString('hex')}`
    const payload = JSON.stringify({ id: eventId, object: 'event', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), livemode: false, data: { object: paid.session } })
    const deliver = () => fetch(`${BACKEND}/api/payments/webhooks/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signed(payload), ...caller() }, body: payload })

    await control('/__fake/fault', { mode: 'error', path: '^GET /v1/subscriptions' })
    const during = await deliver()
    const recorded = await pool.query('SELECT count(*)::int AS n FROM stripe_webhook_events WHERE event_id = $1', [eventId])
    record(w, 'while Stripe errors, the webhook answers 5xx so Stripe retries', during.status >= 500, `HTTP ${during.status}`)
    record(w, '…and is not recorded, so the retry is not skipped as a duplicate', recorded.rows[0]?.n === 0, `rows=${recorded.rows[0]?.n}`)
    await clearFault()

    const retry = await deliver()
    const me = (await (await fetch(`${BACKEND}/api/me`, { headers: headers() })).json()) as { principal?: { membership?: { active?: boolean } } }
    record(w, "Stripe's retry after recovery is processed", retry.status === 200, `HTTP ${retry.status}`)
    record(w, '…and the buyer becomes a member', me.principal?.membership?.active === true, JSON.stringify(me.principal?.membership))

    // ------------------------------------------------------------ Redis
    const r = 'redis down'
    await reset()
    docker('pause', 'questura-readiness-redis')
    try {
      const pay = await timed(checkout)
      record(r, 'checkout fails closed (refused, not charged blind)', pay.value.status === 429 || pay.value.status === 503, `HTTP ${pay.value.status} in ${pay.ms} ms`)
      record(r, '…in bounded time (under 10 s)', pay.ms < 10_000, `${pay.ms} ms`)
      const publicRead = await timed(() => fetch(`${BACKEND}/api/public/locations/menu`, { headers: { origin, ...caller() } }))
      record(r, 'public reads stay up', publicRead.value.status === 200, `HTTP ${publicRead.value.status} in ${publicRead.ms} ms`)
    } finally {
      docker('unpause', 'questura-readiness-redis')
    }
    const recovered = await timed(checkout)
    record(r, 'checkout works again once Redis is back, with no restart', recovered.value.status === 200 || recovered.value.status === 400, `HTTP ${recovered.value.status}`)

    // ------------------------------------------------------------ Postgres
    const d = 'database down'
    docker('pause', 'questura-readiness-pg')
    try {
      const read = await timed(() => fetch(`${BACKEND}/api/public/locations/menu`, { headers: { origin, ...caller() }, signal: AbortSignal.timeout(30_000) }).catch((error) => ({ status: 0, error })))
      const why =
        'Every Postgres timeout is server-side (statement_timeout, lock_timeout), so none fires when the server is unreachable; there is no client-side query_timeout. Owner decision, see the PR.'
      recordKnown(d, 'the API answers, not hangs (under 20 s)', read.ms < 20_000, `${read.ms} ms`, why)
      recordKnown(d, '…with a 503 or a cached 200, never a bare 500', [200, 503].includes((read.value as Response).status), `HTTP ${(read.value as Response).status}`, why)
      const ready = await fetch(`${BACKEND}/api/health/ready`, { signal: AbortSignal.timeout(20_000) }).catch(() => null)
      recordKnown(d, '/api/health/ready stops saying ready', ready?.status !== 200, `HTTP ${ready?.status ?? 'no answer'}`, 'Readiness reports initialisation, not database reachability.')
    } finally {
      docker('unpause', 'questura-readiness-pg')
    }
    const back = await timed(() => fetch(`${BACKEND}/api/public/locations/menu`, { headers: { origin, ...caller() } }))
    record(d, 'the API recovers once Postgres is back, with no restart', back.value.status === 200, `HTTP ${back.value.status} in ${back.ms} ms`)
  } finally {
    await clearFault().catch(() => undefined)
    await pool.end()
  }

  const failedChecks = checks.filter((check) => !check.ok)
  console.log(`\n${checks.length - failedChecks.length}/${checks.length} fault checks passed, ${known.length} known gaps.`)
  if (failedChecks.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(2)
})
