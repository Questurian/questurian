/**
 * Stripe membership lifecycle fixture capture (TEST MODE ONLY)
 *
 * Why this exists
 * ---------------
 * The webhook tests hand-build Stripe payloads. That is how
 * `handleSubscriptionDeleted` came to read `current_period_end` at the
 * subscription root -- a field the SDK's pinned API version does not put there
 * -- while its test stayed green forever. Tests written against invented shapes
 * cannot catch a wrong assumption about the shape.
 *
 * So we stop inventing. This drives a real subscription through its whole life
 * on a Stripe test clock, then reads the events Stripe actually emitted and
 * commits them as fixtures. Everything downstream (derive, resync, emailsFor,
 * entitlement) is tested against those.
 *
 * What it drives
 * --------------
 *   1. paid          subscription created, first invoice paid
 *   2. dunning       card swapped to a failing one, clock advanced past renewal
 *                    -> invoice.payment_failed, subscription -> past_due
 *   3. recovery      card swapped back, retry succeeds -> subscription -> active
 *   4. cancelling    cancel_at_period_end set -> subscription.updated
 *   5. ended         clock advanced past period end -> subscription.deleted
 *
 * Stage 5 is the one that matters most: it is the only way to see whether a
 * real `customer.subscription.deleted` payload carries a usable period end, and
 * at which API version.
 *
 * Safety
 * ------
 * Refuses to run with anything but an `sk_test` key, so it cannot touch live
 * data or move money. Every object it creates is test mode and disposable.
 * Writes only to the fixture file; never touches the database.
 *
 * Usage:
 *   STRIPE_TEST_SECRET_KEY=sk_test_... bun scripts/capture-membership-fixtures.ts
 *
 * The Stripe CLI config on a dev machine already holds a test key under
 * `test_mode_api_key`; read it from there rather than pasting a key anywhere.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Stripe from 'stripe'

const FIXTURE_PATH = resolve(
  __dirname,
  '../src/features/payments/__fixtures__/membership-lifecycle.events.json'
)

/** Stripe test payment methods: one that always works, one that fails on charge. */
const PM_GOOD = 'pm_card_visa'
const PM_FAILING = 'pm_card_chargeCustomerFail'

const MONTH_SECONDS = 60 * 60 * 24 * 31
const DAY_SECONDS = 60 * 60 * 24

function requireTestKey(): string {
  const key = process.env.STRIPE_TEST_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_TEST_SECRET_KEY is not set. See the usage note at the top of this file.')
  }
  if (!key.startsWith('sk_test_')) {
    throw new Error('Refusing to run: STRIPE_TEST_SECRET_KEY must be an sk_test_ key.')
  }
  return key
}

const stripe = new Stripe(requireTestKey(), { typescript: true })

function log(stage: string, message: string) {
  console.log(`[${stage}] ${message}`)
}

async function sleep(ms: number) {
  await new Promise((done) => setTimeout(done, ms))
}

/**
 * Clock advancement is asynchronous: Stripe reports `advancing` until every
 * knock-on object (invoice, charge, subscription transition) has settled.
 * Reading events before it is `ready` would capture a half-finished sequence.
 */
async function advanceClock(clockId: string, toSeconds: number, stage: string) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: toSeconds })

  for (let attempt = 0; attempt < 120; attempt++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId)
    if (clock.status === 'ready') {
      log(stage, `clock settled at ${new Date(toSeconds * 1000).toISOString()}`)
      return
    }
    if (clock.status === 'internal_failure') {
      throw new Error(`Test clock ${clockId} hit an internal failure while advancing.`)
    }
    await sleep(2000)
  }

  throw new Error(`Test clock ${clockId} did not settle within the timeout.`)
}

async function setDefaultPaymentMethod(customerId: string, paymentMethod: string) {
  const attached = await stripe.paymentMethods.attach(paymentMethod, { customer: customerId })
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: attached.id },
  })
  return attached.id
}

/** The subscription id is the join key for everything we capture. */
async function drive(): Promise<{ subscriptionId: string; customerId: string; startedAt: number }> {
  const startedAt = Math.floor(Date.now() / 1000)

  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: startedAt,
    name: 'membership-lifecycle-fixture',
  })
  log('setup', `test clock ${clock.id}`)

  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: 50,
    recurring: { interval: 'month' },
    product_data: { name: 'Questura Membership (fixture)' },
  })
  log('setup', `price ${price.id}`)

  const customer = await stripe.customers.create({
    email: `fixture+${startedAt}@questurian.test`,
    name: 'Fixture Visitor',
    test_clock: clock.id,
  })
  log('setup', `customer ${customer.id}`)

  await setDefaultPaymentMethod(customer.id, PM_GOOD)

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    metadata: { visitorAuthUserId: 'fixture-auth-user' },
  })
  log('paid', `subscription ${subscription.id} status=${subscription.status}`)

  // Stage 2: renewal fails. Swapping the default payment method is what makes
  // the *renewal* fail while the first charge already succeeded -- the real
  // shape of an expired card, not a signup that never worked.
  //
  // Reaching the billing anniversary is not enough: Stripe creates the renewal
  // invoice as a draft there and only finalizes and charges it roughly an hour
  // later, so a clock parked exactly on the anniversary still reports `active`.
  // The second advance is what actually produces the failed payment.
  await setDefaultPaymentMethod(customer.id, PM_FAILING)
  await advanceClock(clock.id, startedAt + MONTH_SECONDS, 'dunning')
  await advanceClock(clock.id, startedAt + MONTH_SECONDS + DAY_SECONDS, 'dunning')

  const afterFailure = await stripe.subscriptions.retrieve(subscription.id)
  log('dunning', `subscription status=${afterFailure.status}`)
  if (afterFailure.status !== 'past_due') {
    log('dunning', 'WARNING: expected past_due; the dunning fixtures may be incomplete')
  }

  // Stage 3: the visitor fixes their card and Stripe's retry succeeds.
  await setDefaultPaymentMethod(customer.id, PM_GOOD)
  await advanceClock(clock.id, startedAt + MONTH_SECONDS + 5 * DAY_SECONDS, 'recovery')

  const afterRecovery = await stripe.subscriptions.retrieve(subscription.id)
  log('recovery', `subscription status=${afterRecovery.status}`)

  // If the retry has not landed yet, pay the open invoice directly so the
  // subscription is genuinely active before we cancel it.
  if (afterRecovery.status !== 'active') {
    const open = await stripe.invoices.list({ subscription: subscription.id, status: 'open', limit: 1 })
    if (open.data[0]?.id) {
      await stripe.invoices.pay(open.data[0].id)
      log('recovery', `paid open invoice ${open.data[0].id} directly`)
      await advanceClock(clock.id, startedAt + MONTH_SECONDS + 5 * DAY_SECONDS, 'recovery')
    }
  }

  // Stage 4: cancel at period end, the flow the account page drives.
  await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true })
  log('cancelling', 'cancel_at_period_end set')

  // Stage 5: run past the period end so Stripe deletes it for real.
  await advanceClock(clock.id, startedAt + 3 * MONTH_SECONDS, 'ended')

  const afterEnd = await stripe.subscriptions.retrieve(subscription.id)
  log('ended', `subscription status=${afterEnd.status}`)

  return { subscriptionId: subscription.id, customerId: customer.id, startedAt }
}

const CAPTURED_EVENT_TYPES = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'checkout.session.completed',
])

function relatesToSubscription(event: Stripe.Event, subscriptionId: string): boolean {
  const object = event.data.object as unknown as Record<string, unknown>

  if (object.object === 'subscription') {
    return object.id === subscriptionId
  }

  const parent = object.parent as { subscription_details?: { subscription?: unknown } } | undefined
  const candidates = [object.subscription, object.subscription_id, parent?.subscription_details?.subscription]

  return candidates.some((value) =>
    typeof value === 'string' ? value === subscriptionId : (value as { id?: string } | undefined)?.id === subscriptionId
  )
}

async function collectEvents(subscriptionId: string, since: number): Promise<Stripe.Event[]> {
  const collected: Stripe.Event[] = []

  for await (const event of stripe.events.list({ created: { gte: since - 60 }, limit: 100 })) {
    if (!CAPTURED_EVENT_TYPES.has(event.type)) continue
    if (!relatesToSubscription(event, subscriptionId)) continue
    collected.push(event)
  }

  // Stripe lists newest first; replaying in emission order is what a handler sees.
  return collected.reverse()
}

/**
 * The question that motivated the whole capture: for each subscription payload,
 * where does the period end actually live?
 */
function reportPeriodEndShape(events: Stripe.Event[]) {
  console.log('\n--- period-end shape, as Stripe really sent it ---')

  for (const event of events) {
    const object = event.data.object as Record<string, any>
    if (object.object !== 'subscription') continue

    const root = object.current_period_end ?? null
    const item = object.items?.data?.[0]?.current_period_end ?? null

    console.log(
      `${event.type.padEnd(32)} api_version=${event.api_version ?? 'unset'}  root=${root ?? 'ABSENT'}  item=${item ?? 'ABSENT'}`
    )
  }
}

async function main() {
  log('setup', 'test mode confirmed, driving the lifecycle')

  const { subscriptionId, customerId, startedAt } = await drive()

  const events = await collectEvents(subscriptionId, startedAt)
  log('capture', `${events.length} events for ${subscriptionId}`)

  reportPeriodEndShape(events)

  const fixture = {
    capturedAt: new Date().toISOString(),
    note: 'Captured from a real Stripe test-clock run. Do not hand-edit; re-run the script.',
    subscriptionId,
    customerId,
    events,
  }

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`)

  console.log(`\nWrote ${events.length} events to ${FIXTURE_PATH}`)
}

main().catch((error) => {
  console.error('Fixture capture failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
