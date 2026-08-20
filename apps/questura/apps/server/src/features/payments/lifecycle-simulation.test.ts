/**
 * End-to-end membership lifecycle simulation.
 *
 * Every other payments test mocks one of the seams — `resyncSubscription`,
 * `deriveSubscriptionState`, or the profile store — and asserts that the seam
 * was called. This file mocks only Stripe and Postgres, drives the real webhook
 * route through the real handlers, the real resync and the real state
 * derivation into a real-shaped profile row, and then asks
 * `deriveVisitorMembership` the only question a member actually cares about:
 * can this person read the paid content right now.
 *
 * That end-to-end shape is the point. `ownsProfileRow` skipping its check when
 * the profile already named the subscription being revoked was invisible to
 * every seam-level test — each half behaved correctly in isolation, and a
 * refunded duplicate still revoked a membership the survivor was paying for.
 * N2b and N12 are the pair that isolate it: same event, same customer, same two
 * subscriptions, differing only in which one the profile names.
 *
 * The fake Stripe below models the behaviours this code depends on — expansion
 * changing `latest_invoice` from an id to an object, a cancelled subscription
 * refusing metadata writes, refund idempotency keys. It is not a specification
 * of Stripe, and a scenario that passes here still has to hold against a
 * sandbox test clock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stripeInvalidRequestError } from './__fixtures__/stripe-errors'

// ---------------------------------------------------------------------------
// Fake Stripe
// ---------------------------------------------------------------------------

type Sub = {
  id: string
  customer: string
  status: string
  cancel_at_period_end: boolean
  created: number
  ended_at: number | null
  metadata: Record<string, string>
  items: { data: Array<{ current_period_start: number; current_period_end: number; price: unknown }> }
  latest_invoice: string | null
}

type Invoice = {
  id: string
  status: string
  paid: boolean
  billing_reason: string
  next_payment_attempt: number | null
  payment_intent: string | null
  charge: string | null
  subscription: string | null
  lines: { data: Array<{ period: { end: number } }> }
}

type Charge = {
  id: string
  invoice: string | null
  refunded: boolean
  payment_intent: string | null
}

const H = vi.hoisted(() => {
const store = {
  subs: new Map<string, Sub>(),
  invoices: new Map<string, Invoice>(),
  charges: new Map<string, Charge>(),
  refunds: [] as Array<{ key: string | undefined; target: string }>,
  cancelCalls: [] as string[],
}

// Built by the SDK's own error class so the fake rejects exactly as a real
// client does -- `type` is the class name, `rawType` the API's spelling. A
// hand-shaped error here is what let the cancelled-subscription refund bug pass
// its tests. Called during tests, never while this factory is hoisted, so the
// top-level import is initialised by the time it runs.
function stripeError(message: string) {
  return stripeInvalidRequestError(message) as Error & { type: string; code?: string }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const fakeStripe = {
  webhooks: {
    // Signature verification is covered elsewhere; here the body IS the event.
    constructEvent: (body: string) => JSON.parse(body),
  },
  subscriptions: {
    retrieve: async (id: string, opts?: { expand?: string[] }) => {
      const sub = store.subs.get(id)
      if (!sub) {
        const err = stripeError(`No such subscription: ${id}`) as Error & { code?: string }
        err.code = 'resource_missing'
        throw err
      }
      const out = clone(sub) as unknown as Record<string, unknown>
      // Expansion is meaningful: `latestInvoiceWasPaid` returns null (unknown)
      // for a string, and that difference decides entitlement on a cancel.
      if (opts?.expand?.includes('latest_invoice') && sub.latest_invoice) {
        out.latest_invoice = clone(store.invoices.get(sub.latest_invoice))
      }
      return out
    },
    list: async ({ customer }: { customer: string }) => ({
      data: [...store.subs.values()].filter((s) => s.customer === customer).map(clone),
    }),
    update: async (id: string, data: Record<string, unknown>) => {
      const sub = store.subs.get(id)
      if (!sub) throw stripeError(`No such subscription: ${id}`)
      if (sub.status === 'canceled') {
        throw stripeError('A canceled subscription can only update its cancellation_details')
      }
      if (data.metadata) {
        for (const [k, v] of Object.entries(data.metadata as Record<string, string>)) {
          if (v === '') delete sub.metadata[k]
          else sub.metadata[k] = v
        }
      }
      if (typeof data.cancel_at_period_end === 'boolean') {
        sub.cancel_at_period_end = data.cancel_at_period_end
      }
      return clone(sub)
    },
    cancel: async (id: string) => {
      store.cancelCalls.push(id)
      const sub = store.subs.get(id)
      if (!sub) throw stripeError(`No such subscription: ${id}`)
      if (sub.status === 'canceled') throw stripeError('Subscription already canceled')
      sub.status = 'canceled'
      sub.ended_at = Math.floor(Date.now() / 1000)
      return clone(sub)
    },
  },
  invoices: {
    retrieve: async (id: string) => {
      const invoice = store.invoices.get(id)
      if (!invoice) throw stripeError(`No such invoice: ${id}`)
      return clone(invoice)
    },
  },
  charges: {
    retrieve: async (id: string) => {
      const charge = store.charges.get(id)
      if (!charge) throw stripeError(`No such charge: ${id}`)
      return clone(charge)
    },
  },
  refunds: {
    create: async (
      params: { payment_intent?: string; charge?: string },
      opts?: { idempotencyKey?: string },
    ) => {
      const key = opts?.idempotencyKey
      if (key && store.refunds.some((r) => r.key === key)) {
        return { id: 're_replayed' }
      }
      store.refunds.push({ key, target: params.payment_intent ?? params.charge ?? '?' })
      return { id: `re_${store.refunds.length}` }
    },
  },
}

return { store, fakeStripe }
})
const { store, fakeStripe } = H

vi.mock('@/payments/lib/stripe', () => ({ stripe: H.fakeStripe }))

// ---------------------------------------------------------------------------
// Fake Payload / Postgres
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: number }

const D = vi.hoisted(() => {
const db = {
  'visitor-profiles': [] as Row[],
  'stripe-webhook-events': [] as Row[],
}
let nextId = 1

function matches(row: Row, where: Record<string, any>): boolean {
  if (where.and) return where.and.every((clause: any) => matches(row, clause))
  return Object.entries(where).every(([field, cond]: [string, any]) => {
    if ('equals' in cond) return row[field] === cond.equals
    if ('greater_than' in cond) return Number(row[field]) > Number(cond.greater_than)
    return false
  })
}

const fakePayload = {
  db: {},
  find: async ({ collection, where }: { collection: keyof typeof db; where?: any }) => {
    const docs = where ? db[collection].filter((row) => matches(row, where)) : db[collection]
    return { docs: docs.map((d) => ({ ...d })), totalDocs: docs.length }
  },
  create: async ({ collection, data }: { collection: keyof typeof db; data: any }) => {
    if (collection === 'stripe-webhook-events') {
      if (db[collection].some((r) => r.eventId === data.eventId)) {
        throw new Error('duplicate key value violates unique constraint "eventId"')
      }
    }
    const row = { id: nextId++, ...data } as Row
    db[collection].push(row)
    return { ...row }
  },
  update: async ({ collection, id, data }: { collection: keyof typeof db; id: number; data: any }) => {
    const row = db[collection].find((r) => r.id === id)
    if (!row) throw new Error('not found')
    Object.assign(row, data)
    return { ...row }
  },
}

return { db, fakePayload, bump: (n: number) => { nextId = n } }
})
const { db, fakePayload } = D

vi.mock('payload', () => ({ getPayload: async () => D.fakePayload }))
vi.mock('@/payload.config', () => ({ default: {} }))

// Per-key mutex, matching production's advisory-lock semantics -- including
// re-entrancy: nested calls share one connection (`AsyncLocalStorage`) and
// Postgres counts advisory locks per session, so re-taking a key this async
// context already holds returns immediately instead of waiting on itself.
// Without that, the checkout handler's collapse lock would deadlock against the
// resync lock nested inside it.
const L = vi.hoisted(() => ({ locks: new Map<string, Promise<unknown>>() }))
const locks = L.locks
vi.mock('@/shared/utils/advisory-lock', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const held = new AsyncLocalStorage<Set<string>>()

  return {
    withAdvisoryLock: (_p: unknown, key: string, work: () => Promise<unknown>) => {
      const owned = held.getStore()

      if (owned?.has(key)) return work()

      const next = new Set(owned ?? [])
      next.add(key)
      const run = () => held.run(next, work)

      const prior = L.locks.get(key) ?? Promise.resolve()
      const result = prior.then(run, run)
      L.locks.set(key, result.then(() => undefined, () => undefined))
      return result
    },
  }
})

const E = vi.hoisted(() => ({ emails: [] as string[] }))
const emails = E.emails
vi.mock('@/emails', () => ({
  sendMembershipConfirmationEmail: async () => { E.emails.push('confirmation'); return { success: true } },
  sendSubscriptionCancelledEmail: async () => { E.emails.push('cancelled'); return { success: true } },
  sendSubscriptionReactivatedEmail: async () => { E.emails.push('reactivated'); return { success: true } },
}))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    stripe: { webhookSecret: 'whsec_test' },
    features: { endorselyAffiliates: false },
  },
}))

import { headers as nextHeaders } from 'next/headers'
import { POST as webhookRoute } from '@/app/api/payments/webhooks/stripe/route'
import { deriveVisitorMembership } from '@/features/visitor-auth/lib/membership-entitlement'

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const DAY = 86400
const now = () => Math.floor(Date.now() / 1000)

let eventSeq = 0

async function deliver(type: string, object: unknown, opts: { created?: number; id?: string } = {}) {
  eventSeq += 1
  const event = {
    id: opts.id ?? `evt_${eventSeq}`,
    type,
    created: opts.created ?? now() + eventSeq,
    data: { object },
  }
  const req = new Request('https://cms.test/api/payments/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: JSON.stringify(event),
  })
  // The route reads the signature via next/headers, not off the request.
  ;(nextHeaders as unknown as { mockResolvedValue: (v: unknown) => void })
    .mockResolvedValue(new Map([['stripe-signature', 'sig']]))
  const res = await webhookRoute(req as never)
  return { status: res.status, body: await res.json() }
}

function profile() {
  return db['visitor-profiles'][0]
}

function entitled() {
  return deriveVisitorMembership(profile() as never).active
}

function makeSub(id: string, over: Partial<Sub> = {}): Sub {
  const start = now() - 2 * DAY
  return {
    id,
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    created: now() - 2 * DAY,
    ended_at: null,
    metadata: { visitorAuthUserId: 'auth_1' },
    items: { data: [{ current_period_start: start, current_period_end: start + 30 * DAY, price: {} }] },
    latest_invoice: null,
    ...over,
  }
}

function makeInvoice(id: string, over: Partial<Invoice> = {}): Invoice {
  return {
    id,
    status: 'paid',
    paid: true,
    billing_reason: 'subscription_create',
    next_payment_attempt: null,
    payment_intent: `pi_${id}`,
    charge: `ch_${id}`,
    subscription: 'sub_A',
    lines: { data: [{ period: { end: now() + 28 * DAY } }] },
    ...over,
  }
}

beforeEach(() => {
  store.subs.clear()
  store.invoices.clear()
  store.charges.clear()
  store.refunds = []
  store.cancelCalls = []
  db['visitor-profiles'] = [
    {
      id: 1,
      authUserId: 'auth_1',
      email: 'buyer@test.com',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: null,
      subscriptionStatus: 'none',
      paidThroughAt: null,
      dunningGraceUntil: null,
      cancelAtPeriodEnd: false,
    } as Row,
  ]
  db['stripe-webhook-events'] = []
  D.bump(100)
  eventSeq = 0
  emails.length = 0
  locks.clear()
})

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('purchase', () => {
  it('S1: checkout completion grants membership through the paid period', async () => {
    const inv = makeInvoice('in_1')
    store.invoices.set(inv.id, inv)
    const sub = makeSub('sub_A', { latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)

    const res = await deliver('checkout.session.completed', {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_A',
      metadata: { visitorAuthUserId: 'auth_1' },
      customer_details: { name: 'Ada L', email: 'buyer@test.com' },
    })

    expect(res.status).toBe(200)
    expect(profile().stripeSubscriptionId).toBe('sub_A')
    expect(profile().subscriptionStatus).toBe('active')
    expect(entitled()).toBe(true)
    expect(emails).toEqual(['confirmation'])
  })

  it('S1b: a 3DS buyer is welcomed once the delayed first charge clears', async () => {
    // Stripe reports `incomplete` until the cardholder finishes the challenge,
    // and `mapStripeStatusToInternal` folds that into `past_due` — the same
    // internal status a failed renewal produces. The welcome email has to
    // survive that collision.
    const start = now() - 60
    const sub = makeSub('sub_A', {
      status: 'incomplete',
      items: { data: [{ current_period_start: start, current_period_end: start + 30 * DAY, price: {} }] },
      latest_invoice: 'in_1',
    })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1', { status: 'open', paid: false }))

    await deliver('customer.subscription.created', sub)

    expect(profile().subscriptionStatus).toBe('past_due')
    // An unpaid first period must not open a dunning window or grant access.
    expect(profile().dunningGraceUntil).toBeNull()
    expect(entitled()).toBe(false)
    expect(emails).toEqual([])

    // The challenge succeeds.
    const s = store.subs.get('sub_A')!
    s.status = 'active'
    store.invoices.set('in_1', makeInvoice('in_1'))

    await deliver('invoice.payment_succeeded', store.invoices.get('in_1'))

    expect(profile().subscriptionStatus).toBe('active')
    expect(entitled()).toBe(true)
    expect(emails).toEqual(['confirmation'])
  })

  it('S1c: an abandoned 3DS attempt expires without mailing anything', async () => {
    // `incomplete_expired` maps to `cancelled`, the same internal status a real
    // ending produces. Nobody was ever let in, so there is no goodbye to send.
    const start = now() - 60
    const sub = makeSub('sub_A', {
      status: 'incomplete',
      items: { data: [{ current_period_start: start, current_period_end: start + 30 * DAY, price: {} }] },
      latest_invoice: 'in_1',
    })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1', { status: 'open', paid: false }))

    await deliver('customer.subscription.created', sub)
    expect(emails).toEqual([])

    // The cardholder never finishes; Stripe expires the attempt ~23h later.
    const s = store.subs.get('sub_A')!
    s.status = 'incomplete_expired'
    s.ended_at = now()

    await deliver('customer.subscription.deleted', s)

    expect(profile().subscriptionStatus).toBe('cancelled')
    expect(entitled()).toBe(false)
    expect(emails).toEqual([])
  })
})

describe('renewal and dunning', () => {
  it('S2: a failed renewal keeps access open through the grace, then recovery clears it', async () => {
    const sub = makeSub('sub_A', {
      status: 'past_due',
      // Stripe rolls the period forward optimistically before the charge clears.
      items: { data: [{ current_period_start: now() - 60, current_period_end: now() + 30 * DAY, price: {} }] },
      latest_invoice: 'in_2',
    })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_2', makeInvoice('in_2', {
      status: 'open', paid: false, billing_reason: 'subscription_cycle',
      next_payment_attempt: now() + 4 * DAY,
    }))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].subscriptionStatus = 'active'

    await deliver('invoice.payment_failed', store.invoices.get('in_2'))

    expect(profile().subscriptionStatus).toBe('past_due')
    // paidThroughAt must NOT be the optimistic period end.
    expect(new Date(profile().paidThroughAt as string).getTime()).toBeLessThan(Date.now() + DAY * 1000)
    expect(profile().dunningGraceUntil).toBeTruthy()
    expect(entitled()).toBe(true) // grace carries them

    // Grace must outlast Stripe's own scheduled retry.
    expect(new Date(profile().dunningGraceUntil as string).getTime())
      .toBeGreaterThan((now() + 4 * DAY) * 1000)

    // Recovery.
    const s = store.subs.get('sub_A')!
    s.status = 'active'
    store.invoices.set('in_3', makeInvoice('in_3', { billing_reason: 'subscription_cycle' }))
    s.latest_invoice = 'in_3'
    await deliver('invoice.payment_succeeded', store.invoices.get('in_3'))

    expect(profile().subscriptionStatus).toBe('active')
    expect(profile().dunningGraceUntil).toBeNull()
    expect(entitled()).toBe(true)
    expect(emails).toEqual([]) // recovery is not a "membership started"
  })

  it('S3: dunning that ends in cancellation must not hand out the unpaid remainder', async () => {
    const start = now() - 60
    const sub = makeSub('sub_A', {
      status: 'canceled',
      ended_at: now(),
      items: { data: [{ current_period_start: start, current_period_end: start + 30 * DAY, price: {} }] },
      latest_invoice: 'in_2',
    })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_2', makeInvoice('in_2', { status: 'open', paid: false }))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].subscriptionStatus = 'past_due'
    // What the failed renewal left behind: paid through the last period it
    // collected, and a grace that has long since run out.
    db['visitor-profiles'][0].paidThroughAt = new Date(start * 1000).toISOString()
    db['visitor-profiles'][0].dunningGraceUntil = new Date(Date.now() - 10 * DAY * 1000).toISOString()

    await deliver('customer.subscription.deleted', sub)

    expect(profile().subscriptionStatus).toBe('cancelled')
    expect(entitled()).toBe(false)
    // This membership was real, so its ending is still announced.
    expect(emails).toEqual(['cancelled'])
  })
})

describe('voluntary cancellation', () => {
  it('S4: cancel-at-period-end keeps access to the paid date and announces once', async () => {
    const sub = makeSub('sub_A', { cancel_at_period_end: true, latest_invoice: 'in_1' })
    store.invoices.set('in_1', makeInvoice('in_1'))
    store.subs.set(sub.id, sub)
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].subscriptionStatus = 'active'

    await deliver('customer.subscription.updated', sub)
    expect(profile().cancelAtPeriodEnd).toBe(true)
    expect(entitled()).toBe(true)
    expect(emails).toEqual(['cancelled'])

    // A redelivery of the same state must not mail again.
    await deliver('customer.subscription.updated', sub)
    expect(emails).toEqual(['cancelled'])
  })
})

describe('refunds and disputes', () => {
  it('S5: a full refund revokes access and stops the billing', async () => {
    const sub = makeSub('sub_A', { latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    store.charges.set('ch_in_1', { id: 'ch_in_1', invoice: 'in_1', refunded: true, payment_intent: 'pi_in_1' })
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].subscriptionStatus = 'active'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 20 * DAY * 1000).toISOString()

    await deliver('charge.refunded', store.charges.get('ch_in_1'))

    expect(profile().paidThroughAt).toBeNull()
    expect(entitled()).toBe(false)
    expect(store.subs.get('sub_A')!.status).toBe('canceled')
  })

  it('S6: a refund on an already-cancelled subscription still revokes (metadata write refused)', async () => {
    const sub = makeSub('sub_A', { status: 'canceled', ended_at: now(), latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    store.charges.set('ch_in_1', { id: 'ch_in_1', invoice: 'in_1', refunded: true, payment_intent: 'pi_in_1' })
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 20 * DAY * 1000).toISOString()

    await deliver('charge.refunded', store.charges.get('ch_in_1'))

    expect(store.subs.get('sub_A')!.metadata.access_revoked).toBeUndefined() // Stripe refused
    expect(profile().paidThroughAt).toBeNull() // profile corrected anyway
    expect(entitled()).toBe(false)
  })

  it('S7: a won dispute restores access; a lost one does not', async () => {
    const sub = makeSub('sub_A', { latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    store.charges.set('ch_in_1', { id: 'ch_in_1', invoice: 'in_1', refunded: false, payment_intent: 'pi_in_1' })
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'

    await deliver('charge.dispute.created', { id: 'dp_1', charge: 'ch_in_1', status: 'needs_response' })
    expect(entitled()).toBe(false)
    expect(store.subs.get('sub_A')!.status).toBe('active') // dispute must not cancel

    await deliver('charge.dispute.closed', { id: 'dp_1', charge: 'ch_in_1', status: 'won' })
    expect(entitled()).toBe(true)
    expect(store.subs.get('sub_A')!.metadata.access_revoked).toBeUndefined()
  })

  it('S8: a lost dispute keeps access revoked', async () => {
    const sub = makeSub('sub_A', { latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    store.charges.set('ch_in_1', { id: 'ch_in_1', invoice: 'in_1', refunded: false, payment_intent: 'pi_in_1' })
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'

    await deliver('charge.dispute.created', { id: 'dp_1', charge: 'ch_in_1', status: 'needs_response' })
    await deliver('charge.dispute.closed', { id: 'dp_1', charge: 'ch_in_1', status: 'lost' })
    expect(entitled()).toBe(false)
  })

  it('S14: a won dispute does not lift a later period\'s refund revocation', async () => {
    // Two periods on one subscription: January is disputed, February is refunded
    // in full. A revocation is three scalar metadata keys, so February's
    // overwrites January's -- and clearing on the won January dispute used to
    // take February's with it, handing back access to a refunded period.
    const januaryEnd = now() - 2 * DAY
    const sub = makeSub('sub_A', { latest_invoice: 'in_2' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1', { lines: { data: [{ period: { end: januaryEnd } }] } }))
    store.invoices.set('in_2', makeInvoice('in_2', { billing_reason: 'subscription_cycle' }))
    store.charges.set('ch_in_1', { id: 'ch_in_1', invoice: 'in_1', refunded: false, payment_intent: 'pi_in_1' })
    store.charges.set('ch_in_2', { id: 'ch_in_2', invoice: 'in_2', refunded: true, payment_intent: 'pi_in_2' })
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].subscriptionStatus = 'active'

    await deliver('charge.dispute.created', { id: 'dp_1', charge: 'ch_in_1', status: 'needs_response' })
    await deliver('charge.refunded', store.charges.get('ch_in_2'))
    expect(entitled()).toBe(false)

    await deliver('charge.dispute.closed', { id: 'dp_1', charge: 'ch_in_1', status: 'won' })

    expect(store.subs.get('sub_A')!.metadata.access_revoked).toBe('true')
    expect(store.subs.get('sub_A')!.metadata.access_revoked_reason).toBe('refund')
    expect(entitled()).toBe(false)
  })

  it('S13: a paid period after a refunded one lifts the revocation', async () => {
    const start = now() - 60
    const sub = makeSub('sub_A', {
      metadata: {
        visitorAuthUserId: 'auth_1',
        access_revoked: 'true',
        access_revoked_reason: 'refund',
        access_revoked_period_end: String(start - DAY),
      },
      items: { data: [{ current_period_start: start, current_period_end: start + 30 * DAY, price: {} }] },
      latest_invoice: 'in_9',
    })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_9', makeInvoice('in_9', { billing_reason: 'subscription_cycle' }))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'

    await deliver('invoice.payment_succeeded', store.invoices.get('in_9'))

    expect(store.subs.get('sub_A')!.metadata.access_revoked).toBeUndefined()
    expect(entitled()).toBe(true)
  })
})

describe('delivery hazards', () => {
  it('S9: a redelivered event runs its side effects exactly once', async () => {
    const sub = makeSub('sub_A', { latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))

    const session = {
      id: 'cs_1', customer: 'cus_1', subscription: 'sub_A',
      metadata: { visitorAuthUserId: 'auth_1' },
      customer_details: { name: 'Ada L', email: 'buyer@test.com' },
    }
    await deliver('checkout.session.completed', session, { id: 'evt_dup' })
    const second = await deliver('checkout.session.completed', session, { id: 'evt_dup' })

    expect(second.body.duplicate).toBe(true)
    expect(emails).toEqual(['confirmation'])
  })

  it('S10: two deliveries of the same event racing do not both run', async () => {
    const sub = makeSub('sub_A', { latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    const session = {
      id: 'cs_1', customer: 'cus_1', subscription: 'sub_A',
      metadata: { visitorAuthUserId: 'auth_1' },
      customer_details: { name: 'Ada L', email: 'buyer@test.com' },
    }

    const [a, b] = await Promise.all([
      deliver('checkout.session.completed', session, { id: 'evt_race' }),
      deliver('checkout.session.completed', session, { id: 'evt_race' }),
    ])

    expect([a.status, b.status]).toEqual([200, 200])
    expect(emails).toEqual(['confirmation'])
  })
})

describe('duplicate checkout collapse', () => {
  it('S11: the paid subscription survives; the extra is refunded and cancelled', async () => {
    const older = makeSub('sub_A', { created: now() - 100, latest_invoice: 'in_A' })
    const newer = makeSub('sub_B', { created: now() - 50, latest_invoice: 'in_B' })
    store.subs.set(older.id, older)
    store.subs.set(newer.id, newer)
    store.invoices.set('in_A', makeInvoice('in_A', { subscription: 'sub_A' }))
    store.invoices.set('in_B', makeInvoice('in_B', { subscription: 'sub_B' }))
    store.charges.set('ch_in_A', { id: 'ch_in_A', invoice: 'in_A', refunded: true, payment_intent: 'pi_in_A' })

    await deliver('checkout.session.completed', {
      id: 'cs_2', customer: 'cus_1', subscription: 'sub_B',
      metadata: { visitorAuthUserId: 'auth_1' },
      customer_details: {},
    })

    expect(profile().stripeSubscriptionId).toBe('sub_B')
    expect(entitled()).toBe(true)
    expect(store.refunds).toHaveLength(1)
    expect(store.subs.get('sub_A')!.status).toBe('canceled')

    // Stripe now emits the refund we just made. It must not revoke the
    // membership that survived.
    await deliver('charge.refunded', store.charges.get('ch_in_A'))
    expect(profile().stripeSubscriptionId).toBe('sub_B')
    expect(entitled()).toBe(true)
  })

  it('S12: an abandoned 3DS attempt is cancelled but never refunded', async () => {
    const abandoned = makeSub('sub_A', { created: now() - 100, status: 'incomplete', latest_invoice: 'in_A' })
    const paid = makeSub('sub_B', { created: now() - 50, latest_invoice: 'in_B' })
    store.subs.set(abandoned.id, abandoned)
    store.subs.set(paid.id, paid)
    store.invoices.set('in_A', makeInvoice('in_A', { status: 'open', paid: false, subscription: 'sub_A' }))
    store.invoices.set('in_B', makeInvoice('in_B', { subscription: 'sub_B' }))

    await deliver('checkout.session.completed', {
      id: 'cs_2', customer: 'cus_1', subscription: 'sub_B',
      metadata: { visitorAuthUserId: 'auth_1' },
      customer_details: {},
    })

    expect(profile().stripeSubscriptionId).toBe('sub_B')
    expect(entitled()).toBe(true)
    expect(store.refunds).toHaveLength(0)
    expect(store.subs.get('sub_A')!.status).toBe('canceled')
  })
})

describe('stale ownership', () => {
  it('S15: an old cancelled subscription cannot overwrite the live one', async () => {
    const live = makeSub('sub_NEW', { created: now() - 10, latest_invoice: 'in_N' })
    const old = makeSub('sub_OLD', { created: now() - 10000, status: 'canceled', ended_at: now() - 5000, latest_invoice: 'in_O' })
    store.subs.set(live.id, live)
    store.subs.set(old.id, old)
    store.invoices.set('in_N', makeInvoice('in_N', { subscription: 'sub_NEW' }))
    store.invoices.set('in_O', makeInvoice('in_O', { subscription: 'sub_OLD' }))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_NEW'
    db['visitor-profiles'][0].subscriptionStatus = 'active'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 20 * DAY * 1000).toISOString()

    await deliver('customer.subscription.deleted', old)

    expect(profile().stripeSubscriptionId).toBe('sub_NEW')
    expect(entitled()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Wave 2: adversarial
// ---------------------------------------------------------------------------

describe('adversarial', () => {
  it('N1: two checkout completions racing on the same customer', async () => {
    const a = makeSub('sub_A', { created: now() - 100, latest_invoice: 'in_A' })
    const b = makeSub('sub_B', { created: now() - 50, latest_invoice: 'in_B' })
    store.subs.set(a.id, a)
    store.subs.set(b.id, b)
    store.invoices.set('in_A', makeInvoice('in_A', { subscription: 'sub_A' }))
    store.invoices.set('in_B', makeInvoice('in_B', { subscription: 'sub_B' }))

    // Different event ids -> different advisory-lock keys -> genuinely parallel.
    const results = await Promise.allSettled([
      deliver('checkout.session.completed', {
        id: 'cs_A', customer: 'cus_1', subscription: 'sub_A',
        metadata: { visitorAuthUserId: 'auth_1' }, customer_details: {},
      }, { id: 'evt_A' }),
      deliver('checkout.session.completed', {
        id: 'cs_B', customer: 'cus_1', subscription: 'sub_B',
        metadata: { visitorAuthUserId: 'auth_1' }, customer_details: {},
      }, { id: 'evt_B' }),
    ])

    // Whatever the interleaving: the buyer must end up entitled, on a live
    // subscription, refunded at most once.
    expect(entitled()).toBe(true)
    const landed = store.subs.get(profile().stripeSubscriptionId as string)!
    expect(landed.status).not.toBe('canceled')
    expect(store.refunds.length).toBeLessThanOrEqual(1)
    void results
  })

  it('N2: the collapse refund lands before the profile has moved to the survivor', async () => {
    const a = makeSub('sub_A', { created: now() - 100, latest_invoice: 'in_A' })
    const b = makeSub('sub_B', { created: now() - 50, latest_invoice: 'in_B' })
    store.subs.set(a.id, a)
    store.subs.set(b.id, b)
    store.invoices.set('in_A', makeInvoice('in_A', { subscription: 'sub_A' }))
    store.invoices.set('in_B', makeInvoice('in_B', { subscription: 'sub_B' }))
    store.charges.set('ch_in_A', { id: 'ch_in_A', invoice: 'in_A', refunded: true, payment_intent: 'pi_in_A' })

    // sub_A's checkout resynced first, so the profile points at the loser.
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].subscriptionStatus = 'active'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 20 * DAY * 1000).toISOString()

    // Stripe cancels + refunds A, and the refund event beats the collapse's resync.
    a.status = 'canceled'
    a.ended_at = now()
    await deliver('charge.refunded', store.charges.get('ch_in_A'))

    // sub_B is live and paid for. The buyer must not be locked out.
    expect(entitled()).toBe(true)
  })

  it('N3: a customer/profile linkage disagreement fails loudly, never silently', async () => {
    const sub = makeSub('sub_A', { customer: 'cus_OTHER', latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    // Profile is linked to cus_1; the event carries cus_OTHER with our metadata.
    const res = await deliver('checkout.session.completed', {
      id: 'cs_1', customer: 'cus_OTHER', subscription: 'sub_A',
      metadata: { visitorAuthUserId: 'auth_1' }, customer_details: {},
    })

    expect(res.status).toBe(500) // Stripe retries; nobody is silently un-granted
    expect(profile().stripeCustomerId).toBe('cus_1') // and nothing was repointed
  })

  it('N5: an expired grace is not silently extended by further failures', async () => {
    const sub = makeSub('sub_A', {
      status: 'past_due',
      items: { data: [{ current_period_start: now() - 60, current_period_end: now() + 30 * DAY, price: {} }] },
      latest_invoice: 'in_2',
    })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_2', makeInvoice('in_2', { status: 'open', paid: false, billing_reason: 'subscription_cycle' }))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].dunningGraceUntil = new Date(Date.now() - DAY * 1000).toISOString()

    await deliver('invoice.payment_failed', store.invoices.get('in_2'))

    expect(new Date(profile().dunningGraceUntil as string).getTime()).toBeLessThan(Date.now())
    expect(entitled()).toBe(false)
  })

  it('N10: different events for one subscription racing produce one email', async () => {
    const sub = makeSub('sub_A', { latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'

    await Promise.all([
      deliver('customer.subscription.created', sub, { id: 'evt_x' }),
      deliver('customer.subscription.updated', sub, { id: 'evt_y' }),
      deliver('invoice.payment_succeeded', store.invoices.get('in_1'), { id: 'evt_z' }),
    ])

    expect(emails).toEqual(['confirmation'])
    expect(entitled()).toBe(true)
  })

  it('N11: a subscription Stripe no longer has does not freeze the profile', async () => {
    const live = makeSub('sub_NEW', { latest_invoice: 'in_N' })
    store.subs.set(live.id, live)
    store.invoices.set('in_N', makeInvoice('in_N', { subscription: 'sub_NEW' }))
    // Profile points at an id Stripe has never heard of.
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_GONE'

    await deliver('customer.subscription.updated', live)

    expect(profile().stripeSubscriptionId).toBe('sub_NEW')
    expect(entitled()).toBe(true)
  })

  it('N12: a refund on an unrelated old subscription cannot revoke a live membership', async () => {
    const live = makeSub('sub_NEW', { created: now() - 10, latest_invoice: 'in_N' })
    const old = makeSub('sub_OLD', { created: now() - 99999, status: 'canceled', ended_at: now() - 9999, latest_invoice: 'in_O' })
    store.subs.set(live.id, live)
    store.subs.set(old.id, old)
    store.invoices.set('in_N', makeInvoice('in_N', { subscription: 'sub_NEW' }))
    store.invoices.set('in_O', makeInvoice('in_O', { subscription: 'sub_OLD' }))
    store.charges.set('ch_in_O', { id: 'ch_in_O', invoice: 'in_O', refunded: true, payment_intent: 'pi_in_O' })
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_NEW'
    db['visitor-profiles'][0].subscriptionStatus = 'active'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 20 * DAY * 1000).toISOString()

    // Goodwill refund on last year's subscription, today.
    await deliver('charge.refunded', store.charges.get('ch_in_O'))

    expect(profile().stripeSubscriptionId).toBe('sub_NEW')
    expect(entitled()).toBe(true)
  })

  it('N13: a delayed event for the old subscription cannot outrun the collapse onto the new one', async () => {
    // The lock has to be keyed on what the *row* belongs to. Keyed per
    // subscription, these two deliveries take different keys and run straight
    // through each other: the sub_A resync decides it owns the row while sub_A
    // is still live, the checkout collapse then refunds and cancels sub_A and
    // writes sub_B, and the sub_A write lands last -- leaving the profile on a
    // cancelled, refunded subscription while sub_B quietly bills.
    const a = makeSub('sub_A', { created: now() - 100, latest_invoice: 'in_A' })
    const b = makeSub('sub_B', { created: now() - 50, latest_invoice: 'in_B' })
    store.subs.set(a.id, a)
    store.subs.set(b.id, b)
    store.invoices.set('in_A', makeInvoice('in_A', { subscription: 'sub_A' }))
    store.invoices.set('in_B', makeInvoice('in_B', { subscription: 'sub_B' }))
    store.charges.set('ch_in_A', { id: 'ch_in_A', invoice: 'in_A', refunded: false, payment_intent: 'pi_in_A' })
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].subscriptionStatus = 'active'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 20 * DAY * 1000).toISOString()

    await Promise.all([
      deliver('customer.subscription.updated', a, { id: 'evt_A' }),
      deliver('checkout.session.completed', {
        id: 'cs_B', customer: 'cus_1', subscription: 'sub_B',
        metadata: { visitorAuthUserId: 'auth_1' }, customer_details: {},
      }, { id: 'evt_B' }),
    ])

    // The row must name the subscription that is actually billing, so /account
    // can cancel it and entitlement is derived from something alive.
    expect(profile().stripeSubscriptionId).toBe('sub_B')
    expect(store.subs.get(profile().stripeSubscriptionId as string)!.status).not.toBe('canceled')
    expect(entitled()).toBe(true)
  })
})

describe('resync ownership when the profile points at the dead subscription', () => {
  /**
   * Paired with N12. Same event, same customer, same two subscriptions — the
   * only difference is which subscription the profile currently names. N12
   * (profile on the live one) is correctly ignored. This one is not.
   */
  it('N2b: a refund on the named-but-dead subscription revokes a live membership', async () => {
    const live = makeSub('sub_A', { created: now() - 100, latest_invoice: 'in_A' })
    const dead = makeSub('sub_B', {
      created: now() - 50, status: 'canceled', ended_at: now(), latest_invoice: 'in_B',
    })
    store.subs.set(live.id, live)
    store.subs.set(dead.id, dead)
    store.invoices.set('in_A', makeInvoice('in_A', { subscription: 'sub_A' }))
    store.invoices.set('in_B', makeInvoice('in_B', { subscription: 'sub_B' }))
    store.charges.set('ch_in_B', { id: 'ch_in_B', invoice: 'in_B', refunded: true, payment_intent: 'pi_in_B' })

    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_B'
    db['visitor-profiles'][0].subscriptionStatus = 'active'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 20 * DAY * 1000).toISOString()

    await deliver('charge.refunded', store.charges.get('ch_in_B'))

    // sub_A is live and paid. The buyer must not be locked out.
    expect(entitled()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Wave 3: shapes and states the happy path never produces
// ---------------------------------------------------------------------------

describe('unusual subscription shapes', () => {
  it('P1: a paused subscription', async () => {
    const sub = makeSub('sub_A', { status: 'paused', latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'

    await deliver('customer.subscription.updated', sub)

    // Documents today's behaviour, which is NOT obviously the wanted one:
    // `paused` has no case in `mapStripeStatusToInternal` and is absent from
    // `UNPAID_CURRENT_PERIOD`, so a paused subscription keeps access to the
    // full period end. Only reachable if pause-collection is enabled in the
    // portal or Dashboard. Flip this assertion when that behaviour is decided.
    expect(profile().subscriptionStatus).toBe('past_due')
    expect(entitled()).toBe(true)
  })

  it('P2: a subscription with no items must not silently zero the paid date', async () => {
    const sub = makeSub('sub_A', { items: { data: [] }, latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 20 * DAY * 1000).toISOString()

    await deliver('customer.subscription.updated', sub)

    // Documents today's behaviour. `getSubscriptionPeriodSeconds` logs a warn
    // and returns nulls, and the null is then written over a valid paid-through
    // date — so an unresolvable period revokes a paying member instantly, and
    // does it to every member at once if the shape ever changes. That is the
    // opposite of `canceledPeriodWasPaid`'s stated rule that silence must never
    // revoke access. Flip this assertion if the write is made non-destructive.
    expect(profile().paidThroughAt).toBeNull()
    expect(entitled()).toBe(false)
  })

  it('P3: grace when Stripe schedules its retry a long way out', async () => {
    const sub = makeSub('sub_A', {
      status: 'past_due',
      items: { data: [{ current_period_start: now() - 60, current_period_end: now() + 30 * DAY, price: {} }] },
      latest_invoice: 'in_2',
    })
    store.subs.set(sub.id, sub)
    // Stripe smart retries can schedule well out on an annual plan.
    store.invoices.set('in_2', makeInvoice('in_2', {
      status: 'open', paid: false, billing_reason: 'subscription_cycle',
      next_payment_attempt: now() + 21 * DAY,
    }))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'

    await deliver('invoice.payment_failed', store.invoices.get('in_2'))

    // The grace is `max(fixed window, Stripe's next retry + 6h)` with no upper
    // bound, so a far-out retry buys a correspondingly long stretch of unpaid
    // access -- three weeks here. Deliberate as far as "never revoke before
    // Stripe has retried" goes; uncapped is the part worth a decision.
    const graceDays = (new Date(profile().dunningGraceUntil as string).getTime() - Date.now()) / (DAY * 1000)
    expect(graceDays).toBeGreaterThan(21)
    expect(entitled()).toBe(true)
  })

  it('P4: trialing grants access', async () => {
    const sub = makeSub('sub_A', { status: 'trialing', latest_invoice: null })
    store.subs.set(sub.id, sub)
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'

    await deliver('customer.subscription.updated', sub)
    expect(profile().subscriptionStatus).toBe('active')
    expect(entitled()).toBe(true)
  })

  it('P5: incomplete_expired grants nothing', async () => {
    const sub = makeSub('sub_A', {
      status: 'incomplete_expired',
      items: { data: [{ current_period_start: now() - 60, current_period_end: now() + 30 * DAY, price: {} }] },
      latest_invoice: 'in_1',
    })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1', { status: 'open', paid: false }))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'

    await deliver('customer.subscription.updated', sub)
    expect(entitled()).toBe(false)
  })

  it('P6: a checkout session with no subscription is refused, not granted', async () => {
    const res = await deliver('checkout.session.completed', {
      id: 'cs_1', customer: 'cus_1', subscription: null,
      metadata: { visitorAuthUserId: 'auth_1' }, customer_details: {},
    })
    expect(res.status).toBe(500)
    expect(entitled()).toBe(false)
  })

  it('P7: collapsing an extra with no collectable charge must not wedge the webhook', async () => {
    const paid = makeSub('sub_A', { created: now() - 100, latest_invoice: 'in_A' })
    const dunned = makeSub('sub_B', { created: now() - 50, status: 'past_due', latest_invoice: 'in_B' })
    store.subs.set(paid.id, paid)
    store.subs.set(dunned.id, dunned)
    store.invoices.set('in_A', makeInvoice('in_A', { subscription: 'sub_A' }))
    // Never collected: no payment_intent, no charge.
    store.invoices.set('in_B', makeInvoice('in_B', {
      subscription: 'sub_B', status: 'open', paid: false, payment_intent: null, charge: null,
    }))

    const res = await deliver('checkout.session.completed', {
      id: 'cs_1', customer: 'cus_1', subscription: 'sub_A',
      metadata: { visitorAuthUserId: 'auth_1' }, customer_details: {},
    })
    expect(res.status).toBe(200)
    expect(profile().stripeSubscriptionId).toBe('sub_A')
    expect(store.refunds).toHaveLength(0)
    expect(entitled()).toBe(true)
  })

  it('P8: a mid-cycle plan switch advances the paid-through date', async () => {
    const sub = makeSub('sub_A', {
      items: { data: [{ current_period_start: now(), current_period_end: now() + 365 * DAY, price: {} }] },
      latest_invoice: 'in_up',
    })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_up', makeInvoice('in_up', { billing_reason: 'subscription_update' }))
    db['visitor-profiles'][0].stripeSubscriptionId = 'sub_A'
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 10 * DAY * 1000).toISOString()

    await deliver('invoice.payment_succeeded', store.invoices.get('in_up'))
    const days = (new Date(profile().paidThroughAt as string).getTime() - Date.now()) / (DAY * 1000)
    expect(days).toBeGreaterThan(300)
    expect(entitled()).toBe(true)
  })

  it('P9: a lost customer linkage is recovered from subscription metadata', async () => {
    const sub = makeSub('sub_A', { latest_invoice: 'in_1' })
    store.subs.set(sub.id, sub)
    store.invoices.set('in_1', makeInvoice('in_1'))
    // Admin cleared the linkage; only Stripe's metadata still knows the visitor.
    db['visitor-profiles'][0].stripeCustomerId = null

    await deliver('customer.subscription.updated', sub)

    expect(profile().stripeCustomerId).toBe('cus_1')
    expect(entitled()).toBe(true)
  })

  it('P10: entitlement is strictly in the future, never on the boundary', async () => {
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() - 1000).toISOString()
    expect(entitled()).toBe(false)
    db['visitor-profiles'][0].paidThroughAt = new Date(Date.now() + 60_000).toISOString()
    expect(entitled()).toBe(true)
  })
})
