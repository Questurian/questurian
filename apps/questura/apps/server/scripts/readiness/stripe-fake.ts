/**
 * A small, stateful Stripe account for the readiness sandbox (launch harness
 * A2, A5, A8). Loopback only, in memory, no money.
 *
 * It answers the calls the app makes: customers, Checkout Sessions,
 * subscriptions, invoices, charges, invoice payments, refunds and the billing
 * portal. Its subscription and invoice objects are **real captured Stripe
 * payloads** (`payments/__fixtures__/membership-lifecycle.events.json`) with
 * only ids, dates, prices and status changed, so the app reads the same shapes
 * it reads from Stripe. Checkout Sessions, charges, disputes and invoice
 * payments have no captured payload yet (A3); they carry the fields the
 * handlers read.
 *
 * Every object is shaped as the pinned API version (2025-08-27.basil) returns
 * it, which is not the version the fixture was captured at. Basil removed
 * `paid`, `charge`, `payment_intent`, `subscription` and `subscription_details`
 * from Invoice and `invoice` from Charge, so they are stripped here: the only
 * way from a charge to its subscription is charge → payment intent → invoice
 * payment → invoice → `parent.subscription_details`, exactly as on Stripe.
 * `invoicePaymentLookups` counts the lookups, so the harness can prove the app
 * took that road.
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

/** Invoice fields the pinned API version (basil) no longer returns. */
const PRE_BASIL_INVOICE_FIELDS = ['paid', 'charge', 'payment_intent', 'subscription', 'subscription_details'] as const

const now = () => Math.floor(Date.now() / 1000)
const newId = (prefix: string) => `${prefix}_fake${randomBytes(9).toString('hex')}`
const DAY = 24 * 60 * 60

export type FakeResponse = { status: number; body: unknown }

function missing(kind: string, id: string, status = 404): FakeResponse {
  return {
    status,
    body: { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such ${kind}: '${id}'` } },
  }
}

const ok = (body: unknown): FakeResponse => ({ status: 200, body })

const invalidParam = (param: string, message: string): FakeResponse => ({
  status: 400,
  body: { error: { type: 'invalid_request_error', code: 'parameter_invalid', param, message } },
})

/**
 * What Stripe refuses on a Managed Payments subscription session, from
 * docs.stripe.com/payments/managed-payments/update-checkout. Written out here
 * rather than imported from the app's own list, so a parameter the app forgets
 * to remove is caught instead of agreed with.
 */
const MANAGED_FORBIDDEN_PATHS: ReadonlyArray<readonly string[]> = [
  ['adaptive_pricing'],
  ['automatic_tax'],
  ['tax_id_collection'],
  ['payment_method_configuration'],
  ['payment_method_types'],
  ['customer_update', 'name'],
  ['customer_update', 'address'],
  ['shipping_address_collection'],
  ['shipping_options'],
  ['invoice_creation'],
  ['subscription_data', 'default_tax_rates'],
  ['subscription_data', 'invoice_settings'],
  ['subscription_data', 'application_fee_percent'],
  ['subscription_data', 'on_behalf_of'],
  ['subscription_data', 'transfer_data'],
]

const paramName = (path: readonly string[]) => path[0] + path.slice(1).map((part) => `[${part}]`).join('')

/**
 * `managed_payments`, checked as Stripe would: only `enabled`, only a boolean,
 * and when true none of the forbidden parameters. Returns the error to answer,
 * or whether the session is managed.
 */
function checkManagedPayments(params: Record<string, unknown>): FakeResponse | boolean {
  if (params.managed_payments === undefined) return false
  const managed = params.managed_payments
  if (typeof managed !== 'object' || managed === null || Array.isArray(managed)) {
    return invalidParam('managed_payments', 'Invalid object')
  }
  for (const key of Object.keys(managed)) {
    if (key !== 'enabled') return invalidParam(`managed_payments[${key}]`, `Received unknown parameter: managed_payments[${key}]`)
  }
  const enabled = (managed as { enabled?: unknown }).enabled
  if (enabled !== 'true' && enabled !== 'false') return invalidParam('managed_payments[enabled]', 'Invalid boolean')
  if (enabled === 'false') return false
  if (params.mode !== 'subscription' && params.mode !== 'payment') {
    return invalidParam('mode', 'Managed Payments supports only `payment` and `subscription` mode.')
  }
  for (const path of MANAGED_FORBIDDEN_PATHS) {
    let node: unknown = params
    for (const part of path) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined
    if (node !== undefined) {
      const name = paramName(path)
      return invalidParam(name, `You cannot use \`${name}\` when \`managed_payments[enabled]\` is true.`)
    }
  }
  return true
}
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
  /** Customers deleted in the "Dashboard" (`deleteCustomer`). */
  deletedCustomers = new Set<string>()
  sessions = new Map<string, StripeObject>()
  subscriptions = new Map<string, StripeObject>()
  invoices = new Map<string, StripeObject>()
  charges = new Map<string, StripeObject>()
  disputes = new Map<string, StripeObject>()
  invoicePayments: StripeObject[] = []
  refunds: StripeObject[] = []
  /** `GET /v1/invoice_payments` calls: how the app finds a charge's invoice on basil. */
  invoicePaymentLookups = 0
  /** Idempotency-Key → the response first given for it, as Stripe replays it. */
  private idempotent = new Map<string, FakeResponse>()
  /** Every Checkout Session creation that reached the account (after idempotency). */
  checkoutCreates = 0

  constructor(private readonly prices: Record<string, { amount: number; interval: string; currency: string }>) {}

  reset(): void {
    this.customers.clear()
    this.deletedCustomers.clear()
    this.sessions.clear()
    this.subscriptions.clear()
    this.invoices.clear()
    this.charges.clear()
    this.disputes.clear()
    this.invoicePayments = []
    this.invoicePaymentLookups = 0
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
      // Stripe leaves deleted customers out of a list.
      const email = url.searchParams.get('email')
      return ok(list([...this.customers.values()].filter((c) => !this.deletedCustomers.has(c.id) && (!email || c.email === email)), path))
    }
    if (method === 'POST' && path === '/v1/customers') {
      const customer: StripeObject = { id: newId('cus'), object: 'customer', created: now(), metadata: {}, ...params }
      this.customers.set(customer.id, customer)
      return remember(ok(customer))
    }
    if ((match = /^\/v1\/customers\/([^/]+)$/.exec(path))) {
      // A deleted customer still answers a read, as a stub that says so.
      if (this.deletedCustomers.has(match[1]!)) return ok({ id: match[1]!, object: 'customer', deleted: true })
      const customer = this.customers.get(match[1]!)
      if (!customer) return missing('customer', match[1]!)
      if (method === 'POST') Object.assign(customer, params)
      return ok(customer)
    }

    // --- checkout
    if (method === 'POST' && path === '/v1/checkout/sessions') {
      if (this.deletedCustomers.has(String(params.customer))) return remember(missing('customer', String(params.customer), 400))
      this.checkoutCreates += 1
      const managed = checkManagedPayments(params)
      if (typeof managed !== 'boolean') return remember(managed)
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
        // What the session was created with, for the harness to read back
        // through `/__fake/state` (never returned by the API).
        _managedPayments: managed,
        _paymentMethodTypes: params.payment_method_types ?? null,
      }
      this.sessions.set(id, session)
      return remember(ok(this.publicSession(session)))
    }
    if ((match = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path)) && method === 'GET') {
      const session = this.sessions.get(match[1]!)
      return session ? ok(this.publicSession(session)) : missing('checkout.session', match[1]!)
    }
    if (method === 'POST' && path === '/v1/billing_portal/sessions') {
      if (this.deletedCustomers.has(String(params.customer))) return missing('customer', String(params.customer), 400)
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
      if (!invoice) return missing('invoice', match[1]!)
      // `payments` is includable: present only when asked for, as on Stripe.
      if (!this.expands(url).includes('payments')) return ok(invoice)
      const payments = this.invoicePayments.filter((entry) => entry.invoice === invoice.id)
      return ok({ ...invoice, payments: list(payments, `/v1/invoices/${invoice.id}/payments`) })
    }
    if (method === 'GET' && path === '/v1/invoice_payments') {
      this.invoicePaymentLookups += 1
      const invoice = url.searchParams.get('invoice')
      const paymentIntent = url.searchParams.get('payment[payment_intent]')
      const status = url.searchParams.get('status')
      const found = this.invoicePayments.filter(
        (entry) =>
          (!invoice || entry.invoice === invoice) &&
          (!paymentIntent || (entry.payment as { payment_intent?: string }).payment_intent === paymentIntent) &&
          (!status || entry.status === status),
      )
      return ok(list(found, path))
    }
    if ((match = /^\/v1\/charges\/([^/]+)$/.exec(path)) && method === 'GET') {
      const charge = this.charges.get(match[1]!)
      return charge ? ok(charge) : missing('charge', match[1]!)
    }
    if ((match = /^\/v1\/disputes\/([^/]+)$/.exec(path)) && method === 'GET') {
      const dispute = this.disputes.get(match[1]!)
      return dispute ? ok(dispute) : missing('dispute', match[1]!)
    }
    if (method === 'POST' && path === '/v1/refunds') {
      const refund: StripeObject = { id: newId('re'), object: 'refund', status: 'succeeded', created: now(), ...params }
      this.refunds.push(refund)
      return remember(ok(refund))
    }

    return null
  }

  /**
   * Control: the buyer paid. Creates the subscription, its paid invoice, and
   * the payment intent's charge and invoice payment that tie them together.
   */
  completeCheckout(
    sessionId: string,
    email = 'buyer@example.com',
  ): { session: StripeObject; subscription: StripeObject; charge: StripeObject } | null {
    const session = this.sessions.get(sessionId)
    // A Checkout Session is paid once. Completing it again would conjure a
    // second subscription out of one payment page, which Stripe cannot do.
    if (!session || session.status === 'complete') return null
    const price = this.prices[String(session._price)]!
    const start = now()
    const end = start + (price.interval === 'year' ? 365 : 30) * DAY

    const subscription = JSON.parse(JSON.stringify(SUBSCRIPTION_TEMPLATE)) as StripeObject
    const subId = newId('sub')
    const invoiceId = newId('in')
    const paymentIntentId = newId('pi')
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
    for (const field of PRE_BASIL_INVOICE_FIELDS) delete invoice[field]
    Object.assign(invoice, {
      id: invoiceId,
      customer: session.customer,
      status: 'paid',
      amount_paid: price.amount,
      amount_due: price.amount,
      created: start,
      period_start: start,
      period_end: end,
      next_payment_attempt: null,
      livemode: false,
    })
    // The period the charge paid for: what a refund or dispute revokes.
    const line = (invoice.lines as { data?: Array<Record<string, unknown>> } | undefined)?.data?.[0]
    if (line) line.period = { start, end }

    // Basil keeps the invoice's subscription under `parent` and nowhere else.
    invoice.parent = {
      type: 'subscription_details',
      quote_details: null,
      subscription_details: { subscription: subId, metadata: session._subscriptionMetadata ?? {} },
    }

    // No `invoice` on the charge: basil removed it.
    const charge: StripeObject = {
      id: newId('ch'),
      object: 'charge',
      amount: price.amount,
      amount_captured: price.amount,
      amount_refunded: 0,
      captured: true,
      currency: price.currency,
      customer: session.customer,
      disputed: false,
      paid: true,
      payment_intent: paymentIntentId,
      refunded: false,
      status: 'succeeded',
      created: start,
      livemode: false,
      metadata: {},
    }
    const invoicePayment: StripeObject = {
      id: newId('inpay'),
      object: 'invoice_payment',
      amount_paid: price.amount,
      amount_requested: price.amount,
      created: start,
      currency: price.currency,
      invoice: invoiceId,
      is_default: true,
      livemode: false,
      payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      status: 'paid',
      status_transitions: { canceled_at: null, paid_at: start },
    }

    this.subscriptions.set(subId, subscription)
    this.invoices.set(invoiceId, invoice)
    this.charges.set(charge.id, charge)
    this.invoicePayments.push(invoicePayment)
    Object.assign(session, {
      status: 'complete',
      payment_status: 'paid',
      subscription: subId,
      customer_details: { email, name: null },
    })
    return { session: this.publicSession(session), subscription, charge }
  }

  /**
   * Control: refund `amount` (all that is left when omitted) off a charge, as
   * the Dashboard would. Returns the charge as `charge.refunded` carries it.
   */
  refundCharge(chargeId: string, amount?: number): StripeObject | null {
    const charge = this.charges.get(chargeId)
    if (!charge) return null
    const total = Number(charge.amount)
    const refunded = Math.min(total, Number(charge.amount_refunded) + (amount ?? total - Number(charge.amount_refunded)))
    Object.assign(charge, { amount_refunded: refunded, refunded: refunded >= total })
    this.refunds.push({ id: newId('re'), object: 'refund', status: 'succeeded', created: now(), charge: chargeId, amount: amount ?? total })
    return charge
  }

  /** Control: the cardholder disputes a charge. Returns the dispute as `charge.dispute.created` carries it. */
  openDispute(chargeId: string): StripeObject | null {
    const charge = this.charges.get(chargeId)
    if (!charge) return null
    const dispute: StripeObject = {
      id: newId('dp'),
      object: 'dispute',
      amount: charge.amount,
      // An id, not the object: the app has to fetch the charge, which is the
      // path where basil's missing `invoice` bit.
      charge: chargeId,
      currency: charge.currency,
      payment_intent: charge.payment_intent,
      reason: 'fraudulent',
      status: 'needs_response',
      created: now(),
      livemode: false,
      metadata: {},
    }
    charge.disputed = true
    this.disputes.set(dispute.id, dispute)
    return dispute
  }

  /** Control: the card network decides. Returns the dispute as `charge.dispute.closed` carries it. */
  closeDispute(disputeId: string, status: 'won' | 'lost'): StripeObject | null {
    const dispute = this.disputes.get(disputeId)
    if (!dispute) return null
    dispute.status = status
    return dispute
  }

  /**
   * Control: a second open session like an earlier one: same customer, price
   * and metadata, new id. The app's checkout no longer needs it (since launch
   * fix plan item 11 it steps past a replayed session that was already paid),
   * but it stays for harnesses that want a session without going through it.
   */
  reopenCheckout(sessionId: string): StripeObject | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    const id = newId('cs')
    const reopened: StripeObject = {
      ...JSON.parse(JSON.stringify(session)),
      id,
      status: 'open',
      payment_status: 'unpaid',
      subscription: null,
      customer_details: undefined,
      url: `http://127.0.0.1:3191/__fake/pay/${id}`,
      created: now(),
    }
    this.sessions.set(id, reopened)
    return this.publicSession(reopened)
  }

  /**
   * Control: a customer deleted in the Dashboard. Stripe cancels its
   * subscriptions as it goes, then refuses new work on it. Returns the customer
   * as `customer.deleted` carries it, and the subscriptions it cancelled.
   */
  deleteCustomer(customerId: string): { customer: StripeObject; subscriptions: StripeObject[] } | null {
    const owned = [...this.subscriptions.values()].filter((s) => s.customer === customerId)
    // A customer the harness made straight through `/v1/checkout/sessions`
    // (no `/v1/customers` call) is known only through its subscriptions.
    const customer = this.customers.get(customerId) ?? (owned.length > 0 ? { id: customerId, object: 'customer' } : null)
    if (!customer) return null
    const cancelled = owned.filter((s) => s.status !== 'canceled')
    for (const subscription of cancelled) this.cancel(subscription)
    this.deletedCustomers.add(customerId)
    return { customer: { ...customer, deleted: true }, subscriptions: cancelled }
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

  /** `expand[]=x` or the SDK's `expand[0]=x`, `expand[1]=y` for a GET. */
  private expands(url: URL): string[] {
    return [...url.searchParams].filter(([key]) => /^expand\[\d*\]$/.test(key)).map(([, value]) => value)
  }

  private expanded(subscription: StripeObject, url: URL): StripeObject {
    const expand = this.expands(url)
    if (!expand.includes('latest_invoice') || typeof subscription.latest_invoice !== 'string') return subscription
    return { ...subscription, latest_invoice: this.invoices.get(subscription.latest_invoice) ?? subscription.latest_invoice }
  }

  private publicSession(session: StripeObject): StripeObject {
    const rest = { ...session }
    delete rest._price
    delete rest._subscriptionMetadata
    delete rest._managedPayments
    delete rest._paymentMethodTypes
    return rest
  }
}
