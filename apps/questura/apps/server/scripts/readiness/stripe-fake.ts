/**
 * A small, stateful Stripe account for the readiness sandbox (launch harness
 * A2, A5, A8). Loopback only, in memory, no money.
 *
 * It answers the calls the app makes: customers, Checkout Sessions,
 * subscriptions, invoices, refunds and the billing portal. Its subscription
 * and invoice objects are **real captured Stripe payloads**
 * (`payments/__fixtures__/membership-lifecycle.events.json`) with only ids,
 * dates, prices and status changed, so the app reads the same shapes it
 * reads from Stripe. Checkout Sessions have no captured payload yet (A3);
 * they carry the fields the handler reads.
 *
 * What it is not: a model of Stripe's billing engine. Nothing renews, retries
 * or cancels by itself. The harness moves state with the control endpoints
 * under `/__fake/`, then tells the app what happened the way Stripe does,
 * with a signed webhook.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(HERE, '../../src/features/payments/__fixtures__/membership-lifecycle.events.json')

type StripeObject = Record<string, unknown> & { id: string }
type Captured = { events: Array<{ type: string; data: { object: StripeObject } }> }

const captured = JSON.parse(readFileSync(FIXTURES, 'utf8')) as Captured
const template = (type: string): StripeObject => {
  const event = captured.events.find((candidate) => candidate.type === type)
  if (!event) throw new Error(`No captured ${type} to build the fake from`)
  return JSON.parse(JSON.stringify(event.data.object)) as StripeObject
}
const SUBSCRIPTION_TEMPLATE = template('customer.subscription.updated')
const INVOICE_TEMPLATE = template('invoice.payment_succeeded')

const now = () => Math.floor(Date.now() / 1000)
const newId = (prefix: string) => `${prefix}_fake${randomBytes(9).toString('hex')}`
const DAY = 24 * 60 * 60

export type FakeResponse = { status: number; body: unknown }

function missing(kind: string, id: string): FakeResponse {
  return {
    status: 404,
    body: { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such ${kind}: '${id}'` } },
  }
}

const ok = (body: unknown): FakeResponse => ({ status: 200, body })
const list = (data: unknown[], url: string) => ({ object: 'list', data, has_more: false, url })

/**
 * Stripe's form encoding (`metadata[k]=v`, `line_items[0][price]=p`,
 * `expand[]=x`) back into an object.
 */
export function parseStripeForm(body: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const path = rawKey.replace(/\]/g, '').split('[')
    let node: Record<string, unknown> | unknown[] = root
    path.forEach((segment, index) => {
      const last = index === path.length - 1
      const nextIsIndex = !last && /^\d*$/.test(path[index + 1]!)
      const container = node as Record<string, unknown>
      if (segment === '' && Array.isArray(node)) {
        if (last) (node as unknown[]).push(value)
        else {
          const child = nextIsIndex ? [] : {}
          ;(node as unknown[]).push(child)
          node = child as Record<string, unknown>
        }
        return
      }
      if (last) {
        container[segment] = value
      } else {
        container[segment] ??= nextIsIndex ? [] : {}
        node = container[segment] as Record<string, unknown>
      }
    })
  }
  return root
}

export class FakeStripeAccount {
  customers = new Map<string, StripeObject>()
  sessions = new Map<string, StripeObject>()
  subscriptions = new Map<string, StripeObject>()
  invoices = new Map<string, StripeObject>()
  refunds: StripeObject[] = []
  /** Idempotency-Key → the response first given for it, as Stripe replays it. */
  private idempotent = new Map<string, FakeResponse>()
  /** Every Checkout Session creation that reached the account (after idempotency). */
  checkoutCreates = 0

  constructor(private readonly prices: Record<string, { amount: number; interval: string; currency: string }>) {}

  reset(): void {
    this.customers.clear()
    this.sessions.clear()
    this.subscriptions.clear()
    this.invoices.clear()
    this.refunds = []
    this.idempotent.clear()
    this.checkoutCreates = 0
  }

  handle(method: string, url: URL, body: string, headers: { idempotencyKey?: string }): FakeResponse | null {
    const params = body ? parseStripeForm(body) : {}
    const path = url.pathname
    let match: RegExpExecArray | null

    const replay = method === 'POST' && headers.idempotencyKey ? this.idempotent.get(headers.idempotencyKey) : undefined
    if (replay) return replay
    const remember = (response: FakeResponse) => {
      if (method === 'POST' && headers.idempotencyKey && response.status < 500) this.idempotent.set(headers.idempotencyKey, response)
      return response
    }

    // --- customers
    if (method === 'GET' && path === '/v1/customers') {
      const email = url.searchParams.get('email')
      return ok(list([...this.customers.values()].filter((c) => !email || c.email === email), path))
    }
    if (method === 'POST' && path === '/v1/customers') {
      const customer: StripeObject = { id: newId('cus'), object: 'customer', created: now(), metadata: {}, ...params }
      this.customers.set(customer.id, customer)
      return remember(ok(customer))
    }
    if ((match = /^\/v1\/customers\/([^/]+)$/.exec(path))) {
      const customer = this.customers.get(match[1]!)
      if (!customer) return missing('customer', match[1]!)
      if (method === 'POST') Object.assign(customer, params)
      return ok(customer)
    }

    // --- checkout
    if (method === 'POST' && path === '/v1/checkout/sessions') {
      this.checkoutCreates += 1
      const lineItems = params.line_items as Array<{ price?: string }> | undefined
      const priceId = lineItems?.[0]?.price ?? ''
      if (!this.prices[priceId]) {
        return remember({ status: 400, body: { error: { type: 'invalid_request_error', message: `No such price: '${priceId}'` } } })
      }
      const id = newId('cs')
      const session: StripeObject = {
        id,
        object: 'checkout.session',
        mode: params.mode,
        status: 'open',
        payment_status: 'unpaid',
        customer: params.customer,
        subscription: null,
        metadata: params.metadata ?? {},
        success_url: params.success_url,
        cancel_url: params.cancel_url,
        url: `http://127.0.0.1:3191/__fake/pay/${id}`,
        livemode: false,
        created: now(),
        _price: priceId,
        _subscriptionMetadata: (params.subscription_data as { metadata?: unknown } | undefined)?.metadata ?? {},
      }
      this.sessions.set(id, session)
      return remember(ok(this.publicSession(session)))
    }
    if (method === 'POST' && path === '/v1/billing_portal/sessions') {
      return ok({ id: newId('bps'), object: 'billing_portal.session', customer: params.customer, url: `http://127.0.0.1:3191/__fake/portal/${String(params.customer)}` })
    }

    // --- subscriptions
    if (method === 'GET' && path === '/v1/subscriptions') {
      const customer = url.searchParams.get('customer')
      const status = url.searchParams.get('status')
      const found = [...this.subscriptions.values()].filter(
        (s) => (!customer || s.customer === customer) && (!status || status === 'all' || s.status === status),
      )
      return ok(list(found.map((s) => this.expanded(s, url)), path))
    }
    if ((match = /^\/v1\/subscriptions\/([^/]+)$/.exec(path))) {
      const subscription = this.subscriptions.get(match[1]!)
      if (!subscription) return missing('subscription', match[1]!)
      if (method === 'POST') {
        const { metadata, ...rest } = params as { metadata?: Record<string, string>; cancel_at_period_end?: string }
        if (rest.cancel_at_period_end !== undefined) subscription.cancel_at_period_end = rest.cancel_at_period_end === 'true'
        if (metadata) subscription.metadata = { ...(subscription.metadata as object), ...metadata }
      }
      if (method === 'DELETE') this.cancel(subscription)
      return ok(this.expanded(subscription, url))
    }

    // --- invoices, charges, refunds
    if ((match = /^\/v1\/invoices\/([^/]+)$/.exec(path)) && method === 'GET') {
      const invoice = this.invoices.get(match[1]!)
      return invoice ? ok(invoice) : missing('invoice', match[1]!)
    }
    if (method === 'POST' && path === '/v1/refunds') {
      const refund: StripeObject = { id: newId('re'), object: 'refund', status: 'succeeded', created: now(), ...params }
      this.refunds.push(refund)
      return remember(ok(refund))
    }

    return null
  }

  /** Control: the buyer paid. Creates the subscription and its paid invoice. */
  completeCheckout(sessionId: string, email = 'buyer@example.com'): { session: StripeObject; subscription: StripeObject } | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    const price = this.prices[String(session._price)]!
    const start = now()
    const end = start + (price.interval === 'year' ? 365 : 30) * DAY

    const subscription = JSON.parse(JSON.stringify(SUBSCRIPTION_TEMPLATE)) as StripeObject
    const subId = newId('sub')
    const invoiceId = newId('in')
    const item = (subscription.items as { data: Array<Record<string, unknown>> }).data[0]!
    Object.assign(item, {
      id: newId('si'),
      subscription: subId,
      current_period_start: start,
      current_period_end: end,
      price: { ...(item.price as object), id: session._price, unit_amount: price.amount, currency: price.currency, recurring: { interval: price.interval, interval_count: 1 } },
      plan: { ...(item.plan as object), id: session._price, amount: price.amount, currency: price.currency, interval: price.interval },
    })
    Object.assign(subscription, {
      id: subId,
      customer: session.customer,
      status: 'active',
      created: start,
      start_date: start,
      billing_cycle_anchor: start,
      current_period_start: start,
      current_period_end: end,
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      latest_invoice: invoiceId,
      metadata: session._subscriptionMetadata ?? {},
      test_clock: null,
      livemode: false,
    })

    const invoice = JSON.parse(JSON.stringify(INVOICE_TEMPLATE)) as StripeObject
    Object.assign(invoice, {
      id: invoiceId,
      customer: session.customer,
      subscription: subId,
      status: 'paid',
      paid: true,
      amount_paid: price.amount,
      amount_due: price.amount,
      created: start,
      period_start: start,
      period_end: end,
      next_payment_attempt: null,
      livemode: false,
    })
    // Newer API versions put the subscription under `parent`; keep both honest.
    if (invoice.parent && typeof invoice.parent === 'object') {
      const parent = invoice.parent as { subscription_details?: Record<string, unknown> }
      if (parent.subscription_details) parent.subscription_details.subscription = subId
    }

    this.subscriptions.set(subId, subscription)
    this.invoices.set(invoiceId, invoice)
    Object.assign(session, {
      status: 'complete',
      payment_status: 'paid',
      subscription: subId,
      customer_details: { email, name: null },
    })
    return { session: this.publicSession(session), subscription }
  }

  /** Control: change a subscription the way Stripe's billing would have. */
  patchSubscription(id: string, patch: Record<string, unknown>): StripeObject | null {
    const subscription = this.subscriptions.get(id)
    if (!subscription) return null
    const { current_period_start, current_period_end, ...rest } = patch
    Object.assign(subscription, rest)
    const item = (subscription.items as { data: Array<Record<string, unknown>> }).data[0]!
    if (current_period_start !== undefined) Object.assign(item, { current_period_start }) && (subscription.current_period_start = current_period_start)
    if (current_period_end !== undefined) Object.assign(item, { current_period_end }) && (subscription.current_period_end = current_period_end)
    return subscription
  }

  private cancel(subscription: StripeObject): void {
    Object.assign(subscription, { status: 'canceled', canceled_at: now(), ended_at: now(), cancel_at_period_end: false })
  }

  private expanded(subscription: StripeObject, url: URL): StripeObject {
    const expand = url.searchParams.getAll('expand[]').concat(url.searchParams.getAll('expand[0]'))
    if (!expand.includes('latest_invoice') || typeof subscription.latest_invoice !== 'string') return subscription
    return { ...subscription, latest_invoice: this.invoices.get(subscription.latest_invoice) ?? subscription.latest_invoice }
  }

  private publicSession(session: StripeObject): StripeObject {
    const rest = { ...session }
    delete rest._price
    delete rest._subscriptionMetadata
    return rest
  }
}
