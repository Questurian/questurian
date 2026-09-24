/**
 * A whole purchase, and Stripe's delivery quirks, against the production
 * build and a real Postgres (launch harness A8 + A2). No Stripe: the sandbox
 * stub's fake account (`stripe-fake.ts`) plays it, and every webhook is
 * signed with the sandbox's placeholder secret.
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:purchase
 *
 * A8, the purchase:
 *   signed-in non-member → checkout (a double click makes one session) →
 *   the buyer pays → `checkout.session.completed` → member, body opens →
 *   a second checkout is refused → cancel → Stripe ends the subscription
 *   (`customer.subscription.deleted`, period over) → locked, and Subscribe
 *   works again.
 *
 * A2, deliveries:
 *   the same event ten times at once → recorded once; an older event after a
 *   newer one → skipped as stale; an event for a customer with no profile →
 *   refused so Stripe retries, nobody's access changes; two customers at once
 *   → neither waits on the other's lock, both land.
 *
 * Refunds and disputes, with basil-shaped charges (no `invoice` on them, as
 * the pinned Stripe API version returns them):
 *   a partial refund changes nothing → a full refund ends the membership and
 *   the billing → a dispute suspends the membership but keeps billing → won,
 *   it comes back → lost, it stays ended and the billing stops. Every one of
 *   them finds the charge's invoice through an invoice payment.
 *
 * Uses `nonmember@example.com` and `member-b@example.com`. It changes their
 * membership in the sandbox database only.
 */

import { createHmac, randomBytes } from 'node:crypto'

import { Pool } from 'pg'

import { SANDBOX_WEBHOOK_SECRET } from './apps'
import { signIn } from './identities'
import { LAUNCH_MANIFEST_PATH, type LaunchManifest } from './launch-corpus'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { freshRateLimits, readStackState, STACK_PORTS } from './stack'
import { readFileSync } from 'node:fs'

const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`
const STRIPE = `http://127.0.0.1:${STACK_PORTS.stripe}`

type Check = { group: string; name: string; ok: boolean; detail: string }
const checks: Check[] = []
function record(group: string, name: string, ok: boolean, detail = ''): void {
  checks.push({ group, name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} [${group}] ${name}${ok ? '' : ` — ${detail}`}`)
}

const now = () => Math.floor(Date.now() / 1000)
let address = 0
const caller = () => {
  address += 1
  return { 'cf-connecting-ip': `198.19.${Math.floor(address / 250)}.${(address % 250) + 1}` }
}

type Json = Record<string, unknown>

async function fake(path: string, body?: unknown): Promise<Json> {
  const response = await fetch(`${STRIPE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return (await response.json()) as Json
}

function signed(payload: string): string {
  const t = now()
  const v1 = createHmac('sha256', SANDBOX_WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')
  return `t=${t},v1=${v1}`
}

async function deliver(type: string, object: unknown, options: { id?: string; created?: number } = {}): Promise<{ status: number; body: Json | null; id: string }> {
  const id = options.id ?? `evt_fake${randomBytes(9).toString('hex')}`
  const payload = JSON.stringify({ id, object: 'event', type, created: options.created ?? now(), livemode: false, data: { object } })
  const response = await fetch(`${BACKEND}/api/payments/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signed(payload), ...caller() },
    body: payload,
  })
  return { status: response.status, body: (await response.json().catch(() => null)) as Json | null, id }
}

async function main(): Promise<void> {
  const settings = sandboxSettings()
  assertPreflight(settings)
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  // Scripts run back to back share the per-address budgets; start from zero.
  await freshRateLimits()
  const origin = stack.origins.client
  const manifest = JSON.parse(readFileSync(LAUNCH_MANIFEST_PATH, 'utf8')) as LaunchManifest
  const memberPiece = manifest.pieces.find((piece) => piece.access === 'member' && piece.status === 'published' && piece.markers.member)!
  const memberMarker = memberPiece.markers.member!
  const pool = new Pool({ connectionString: settings.databaseUri, max: 2 })

  await fake('/__fake/reset', {})

  const as = (cookie: string) => ({ cookie, origin, 'content-type': 'application/json', ...caller() })
  const me = async (cookie: string) => (await (await fetch(`${BACKEND}/api/me`, { headers: as(cookie) })).json()) as { authenticated?: boolean; principal?: { membership?: { active?: boolean } } }
  const isMember = async (cookie: string) => (await me(cookie)).principal?.membership?.active === true
  const body = async (cookie: string) => {
    const response = await fetch(`${BACKEND}/api/public/articles/full?type=${memberPiece.type}&id=${memberPiece.id}&lang=en`, { headers: as(cookie) })
    const text = await response.text()
    return { status: response.status, hasMarker: text.includes(memberMarker) }
  }
  const checkout = (cookie: string, plan: 'monthly' | 'yearly' = 'monthly') =>
    fetch(`${BACKEND}/api/payments/create-checkout-session`, { method: 'POST', headers: as(cookie), body: JSON.stringify({ plan }) })

  try {
    // Start from a non-member whatever an earlier run left behind.
    await pool.query(
      `UPDATE visitor_profiles SET stripe_customer_id = NULL, stripe_subscription_id = NULL, subscription_status = 'none', paid_through_at = NULL, dunning_grace_until = NULL, cancel_at_period_end = false
       WHERE email IN ('nonmember@example.com', 'member-b@example.com')`,
    )

    // ---------------------------------------------------------------- A8
    const group = 'purchase'
    const buyer = await signIn(BACKEND, origin, 'nonmember@example.com', '198.19.250.1')

    record(group, 'starts as a non-member', !(await isMember(buyer)))
    const before = await body(buyer)
    record(group, 'the member body is refused before paying', before.status === 403 && !before.hasMarker, `HTTP ${before.status}`)

    const [first, second] = await Promise.all([checkout(buyer), checkout(buyer)])
    const firstBody = (await first.json()) as { url?: string }
    const secondBody = (await second.json()) as { url?: string }
    record(group, 'checkout answers with a Stripe URL', first.status === 200 && Boolean(firstBody.url), `HTTP ${first.status} ${JSON.stringify(firstBody)}`)
    const state = await fake('/__fake/state')
    record(
      group,
      'a double click makes one Checkout Session',
      firstBody.url === secondBody.url && (state.sessions as unknown[]).length === 1,
      `urls ${firstBody.url} / ${secondBody.url}, sessions=${(state.sessions as unknown[]).length}`,
    )

    const sessionId = String(firstBody.url ?? '').split('/').pop()!
    const paid = await fake(`/__fake/checkout/${sessionId}/complete`, { email: 'nonmember@example.com' })
    const subscription = paid.subscription as Json
    const completed = await deliver('checkout.session.completed', paid.session)
    record(group, 'checkout.session.completed is accepted', completed.status === 200, `HTTP ${completed.status} ${JSON.stringify(completed.body)}`)

    record(group, 'the buyer is now a member', await isMember(buyer))
    const after = await body(buyer)
    record(group, 'the member body opens', after.status === 200 && after.hasMarker, `HTTP ${after.status}`)

    const again = await checkout(buyer)
    record(group, 'a second checkout is refused while the subscription is live', again.status === 400, `HTTP ${again.status}`)

    const cancel = await fetch(`${BACKEND}/api/payments/cancel-subscription`, { method: 'POST', headers: as(buyer), body: '{}' })
    const cancelled = await fake('/__fake/state')
    const live = (cancelled.subscriptions as Json[]).find((s) => s.id === subscription.id)
    record(group, 'cancel asks Stripe to stop at period end', cancel.status === 200 && live?.cancel_at_period_end === true, `HTTP ${cancel.status} cancel_at_period_end=${live?.cancel_at_period_end}`)
    record(group, 'still a member until the paid period ends', await isMember(buyer))

    // The period runs out and Stripe ends the subscription.
    const ended = await fake(`/__fake/subscriptions/${subscription.id}`, {
      status: 'canceled',
      canceled_at: now() - 60,
      ended_at: now() - 60,
      cancel_at_period_end: false,
      current_period_start: now() - 30 * 24 * 60 * 60 - 60,
      current_period_end: now() - 60,
    })
    const deleted = await deliver('customer.subscription.deleted', ended)
    record(group, 'customer.subscription.deleted is accepted', deleted.status === 200, `HTTP ${deleted.status}`)
    record(group, 'after the period, no longer a member', !(await isMember(buyer)))
    const locked = await body(buyer)
    record(group, 'the member body locks again', locked.status === 403 && !locked.hasMarker, `HTTP ${locked.status}`)
    const resubscribe = await checkout(buyer)
    record(group, 'Subscribe works again', resubscribe.status === 200, `HTTP ${resubscribe.status}`)

    // ---------------------------------------------------------------- A2
    const a2 = 'deliveries'
    const reader = await signIn(BACKEND, origin, 'member-b@example.com', '198.19.250.2')
    const readerCheckout = (await (await checkout(reader)).json()) as { url?: string }
    const readerPaid = await fake(`/__fake/checkout/${String(readerCheckout.url).split('/').pop()}/complete`, { email: 'member-b@example.com' })
    await deliver('checkout.session.completed', readerPaid.session)
    const readerSub = readerPaid.subscription as Json

    const burstId = `evt_fakeburst${randomBytes(6).toString('hex')}`
    const burst = await Promise.all(Array.from({ length: 10 }, () => deliver('customer.subscription.updated', readerSub, { id: burstId })))
    const rows = await pool.query('SELECT count(*)::int AS n FROM stripe_webhook_events WHERE event_id = $1', [burstId])
    record(a2, 'the same event ten times at once is recorded once', rows.rows[0]?.n === 1, `rows=${rows.rows[0]?.n}`)
    record(a2, 'every copy of it is acknowledged, none retried', burst.every((r) => r.status === 200), burst.map((r) => r.status).join(','))
    record(a2, 'exactly one copy did the work', burst.filter((r) => r.body && !r.body.duplicate && !r.body.stale).length === 1, JSON.stringify(burst.map((r) => r.body)))

    const newer = await deliver('customer.subscription.updated', readerSub, { created: now() + 5 })
    const older = await deliver('customer.subscription.updated', readerSub, { created: now() - 3600 })
    record(a2, 'an older event arriving after a newer one is skipped as stale', newer.status === 200 && older.status === 200 && older.body?.stale === true, JSON.stringify(older.body))

    const strangerCustomer = await fetch(`${STRIPE}/v1/customers`, { method: 'POST', body: 'email=stranger%40example.com' }).then((r) => r.json() as Promise<Json>)
    const strangerSession = await fetch(`${STRIPE}/v1/checkout/sessions`, {
      method: 'POST',
      body: `customer=${strangerCustomer.id}&mode=subscription&line_items[0][price]=price_readiness_monthly&line_items[0][quantity]=1`,
    }).then((r) => r.json() as Promise<Json>)
    const strangerPaid = await fake(`/__fake/checkout/${strangerSession.id}/complete`, { email: 'stranger@example.com' })
    const stranger = await deliver('customer.subscription.updated', strangerPaid.subscription)
    // Deliberate (subscription-profile.ts): with no profile and no metadata to
    // find one by, the webhook fails so Stripe retries, in case the profile
    // is being created right now. Stripe gives up after about three days.
    record(a2, 'an event for a customer with no profile is refused for retry, not guessed at', stranger.status === 500, `HTTP ${stranger.status} ${JSON.stringify(stranger.body)}`)
    record(a2, "…and changes nobody's access", (await isMember(reader)) && !(await isMember(buyer)))

    const t0 = Date.now()
    const [x, y] = await Promise.all([
      deliver('customer.subscription.updated', readerSub, { created: now() + 10 }),
      deliver('customer.subscription.updated', ended, { created: now() + 10 }),
    ])
    record(a2, 'two customers at once both land', x.status === 200 && y.status === 200, `${x.status}/${y.status}`)
    record(a2, "and neither waited out the other's lock (under 8 s together)", Date.now() - t0 < 8_000, `${Date.now() - t0} ms`)

    // ------------------------------------------------ refunds and disputes
    // The fake's charges carry no `invoice`, as the pinned API version (basil)
    // returns them, so each of these only works if the app goes charge →
    // payment intent → invoice payment → invoice → subscription.
    const money = 'refunds and disputes'
    const subscriptionOf = async (id: unknown) =>
      ((await fake('/__fake/state')).subscriptions as Json[]).find((s) => s.id === id)
    const buy = async (cookie: string, email: string, plan: 'monthly' | 'yearly') => {
      const started = (await (await checkout(cookie, plan)).json()) as { url?: string }
      const done = await fake(`/__fake/checkout/${String(started.url).split('/').pop()}/complete`, { email })
      const delivered = await deliver('checkout.session.completed', done.session)
      return { subscription: (done.subscription ?? {}) as Json, charge: (done.charge ?? {}) as Json, status: delivered.status }
    }
    const lookupsBefore = Number((await fake('/__fake/state')).invoicePaymentLookups)

    // The buyer buys again (the Subscribe from A8 hands back its open session),
    // is refunded part of it, then all of it.
    const refundBuy = await buy(buyer, 'nonmember@example.com', 'monthly')
    record(money, 'the buyer buys again and is a member', refundBuy.status === 200 && (await isMember(buyer)), `HTTP ${refundBuy.status}`)
    record(money, 'the charge carries no invoice, as basil returns it', Boolean(refundBuy.charge.id) && !('invoice' in refundBuy.charge), JSON.stringify(refundBuy.charge))

    const partial = await deliver('charge.refunded', await fake(`/__fake/charges/${refundBuy.charge.id}/refund`, { amount: 100 }))
    record(money, 'a partial refund is accepted', partial.status === 200, `HTTP ${partial.status}`)
    const afterPartial = await subscriptionOf(refundBuy.subscription.id)
    record(money, 'a partial refund leaves the membership and the billing alone', (await isMember(buyer)) && afterPartial?.status === 'active', `status=${afterPartial?.status}`)

    const full = await deliver('charge.refunded', await fake(`/__fake/charges/${refundBuy.charge.id}/refund`, {}))
    record(money, 'a full refund is accepted', full.status === 200, `HTTP ${full.status} ${JSON.stringify(full.body)}`)
    record(money, 'a full refund ends the membership', !(await isMember(buyer)))
    const refunded = await subscriptionOf(refundBuy.subscription.id)
    record(money, 'a full refund stops the billing', refunded?.status === 'canceled', `status=${refunded?.status}`)
    const refundedBody = await body(buyer)
    record(money, 'the member body locks after a refund', refundedBody.status === 403 && !refundedBody.hasMarker, `HTTP ${refundedBody.status}`)

    // The reader disputes their charge, and the bank sides with the site.
    const readerCharge = (readerPaid.charge ?? {}) as Json
    const opened = await fake(`/__fake/charges/${readerCharge.id}/dispute`, {})
    const disputeCreated = await deliver('charge.dispute.created', opened)
    record(money, 'a dispute opening is accepted', disputeCreated.status === 200, `HTTP ${disputeCreated.status} ${JSON.stringify(disputeCreated.body)}`)
    record(money, 'an open dispute suspends the membership', !(await isMember(reader)))
    const underDispute = await subscriptionOf(readerSub.id)
    record(money, 'an open dispute keeps the subscription, so a win can restore it', underDispute?.status === 'active', `status=${underDispute?.status}`)
    const won = await deliver('charge.dispute.closed', await fake(`/__fake/disputes/${opened.id}/close`, { status: 'won' }))
    record(money, 'a won dispute is accepted and restores the membership', won.status === 200 && (await isMember(reader)), `HTTP ${won.status}`)

    // The buyer buys once more (yearly, so a fresh Checkout Session), disputes,
    // and loses.
    const disputeBuy = await buy(buyer, 'nonmember@example.com', 'yearly')
    record(money, 'the buyer buys a third time and is a member', disputeBuy.status === 200 && (await isMember(buyer)), `HTTP ${disputeBuy.status}`)
    const lostOpened = await fake(`/__fake/charges/${disputeBuy.charge.id}/dispute`, {})
    const lostCreated = await deliver('charge.dispute.created', lostOpened)
    const lost = await deliver('charge.dispute.closed', await fake(`/__fake/disputes/${lostOpened.id}/close`, { status: 'lost' }))
    record(money, 'a lost dispute is accepted and the membership stays ended', lostCreated.status === 200 && lost.status === 200 && !(await isMember(buyer)), `HTTP ${lostCreated.status}/${lost.status}`)
    const lostSub = await subscriptionOf(disputeBuy.subscription.id)
    record(money, 'a lost dispute stops the billing', lostSub?.status === 'canceled', `status=${lostSub?.status}`)

    // Full refund, dispute opened, won, opened, lost: five lookups. The
    // partial refund stops before looking anything up.
    const lookups = Number((await fake('/__fake/state')).invoicePaymentLookups) - lookupsBefore
    record(money, 'each of them found its invoice through an invoice payment', lookups >= 5, `lookups=${lookups}`)
  } finally {
    await pool.end()
  }

  const failed = checks.filter((check) => !check.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} purchase checks passed.`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(2)
})
