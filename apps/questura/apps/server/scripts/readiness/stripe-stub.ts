import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { MEMBERSHIP_CATALOG } from '../../src/features/payments/lib/membership-catalog'
import { FakeStripeAccount } from './stripe-fake'

/**
 * A Stripe that only knows two prices, on loopback (surge plan L01).
 *
 * The pricing page and the membership plans endpoint retrieve the configured
 * price from Stripe on every render that is not cached. In the sandbox that
 * was two refused connections to api.stripe.com per build — refused by the
 * socket guard, but still *attempted*, and the plan forbids attempting a
 * Stripe call at all. So the SDK is pointed here instead (the loopback-only
 * seam in `features/payments/lib/stripe.ts`, active only with
 * `READINESS_SANDBOX=1`).
 *
 * It answers `GET /v1/prices/:id` for the two sandbox price ids with a price
 * that matches the catalog exactly, so the site's own guard
 * (`getPurchasablePlan`) passes for the reason it would in production.
 *
 * Customers, Checkout, subscriptions, invoices and refunds are answered by a
 * small in-memory account (`stripe-fake.ts`), so a whole purchase can run in
 * the sandbox (launch harness A8). The harness moves that account's state
 * with `/__fake/*` and tells the app with signed webhooks, as Stripe would.
 * Anything else gets a 400 and is counted, so a journey that reaches for an
 * unmodelled call fails loudly. Nothing here can take money; nothing here
 * talks to Stripe.
 */

export const STUB_PRICES = {
  monthly: 'price_readiness_monthly',
  yearly: 'price_readiness_yearly',
} as const

export type StripeStubStats = { prices: number; refused: Record<string, number> }

function price(plan: keyof typeof STUB_PRICES) {
  const catalog = MEMBERSHIP_CATALOG[plan]
  return {
    id: STUB_PRICES[plan],
    object: 'price',
    active: true,
    currency: catalog.currency,
    unit_amount: catalog.amount,
    recurring: { interval: catalog.interval, interval_count: 1 },
    metadata: {},
    product: { id: 'prod_readiness', object: 'product', name: 'Questurian Membership (readiness stub)' },
  }
}

const FAKE_PRICES = Object.fromEntries(
  (Object.keys(STUB_PRICES) as Array<keyof typeof STUB_PRICES>).map((plan) => [
    STUB_PRICES[plan],
    { amount: MEMBERSHIP_CATALOG[plan].amount, interval: MEMBERSHIP_CATALOG[plan].interval, currency: MEMBERSHIP_CATALOG[plan].currency },
  ]),
)

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * A failure to inject into `/v1/*` (launch harness A7). `hang` never answers;
 * `hang-after` does the work and then never answers, the case where only the
 * SDK's idempotency key stops a retry from doing it twice; `error` answers
 * 500; `slow` answers after `ms`. `path` limits it to matching requests and
 * `times` to that many of them.
 */
export type StripeFault = { mode: 'hang' | 'hang-after' | 'error' | 'slow'; ms?: number; path?: string; times?: number }

export class StripeStub {
  readonly stats: StripeStubStats = { prices: 0, refused: {} }
  readonly account = new FakeStripeAccount(FAKE_PRICES)
  fault: StripeFault | null = null
  private server: Server | null = null

  /** The fault for this request, if any, counting it down. */
  private takeFault(method: string, path: string): StripeFault | null {
    const fault = this.fault
    if (!fault || !path.startsWith('/v1/')) return null
    if (fault.path && !new RegExp(fault.path).test(`${method} ${path}`)) return null
    if (fault.times !== undefined) {
      fault.times -= 1
      if (fault.times <= 0) this.fault = null
    }
    return fault
  }

  async listen(port: number): Promise<number> {
    this.server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const body = await readBody(req)
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }

      // Harness controls. Loopback only, like everything here.
      if (url.pathname === '/__fake/reset' && req.method === 'POST') {
        this.account.reset()
        return send(200, { reset: true })
      }
      if (url.pathname === '/__fake/fault' && req.method === 'POST') {
        const fault = JSON.parse(body || 'null') as StripeFault | null
        this.fault = fault && fault.mode ? fault : null
        return send(200, { fault: this.fault })
      }
      if (url.pathname === '/__fake/state') {
        return send(200, {
          customers: [...this.account.customers.values()],
          sessions: [...this.account.sessions.values()],
          subscriptions: [...this.account.subscriptions.values()],
          refunds: this.account.refunds,
          checkoutCreates: this.account.checkoutCreates,
        })
      }
      let control: RegExpExecArray | null
      if ((control = /^\/__fake\/checkout\/([^/]+)\/complete$/.exec(url.pathname)) && req.method === 'POST') {
        const done = this.account.completeCheckout(control[1]!, JSON.parse(body || '{}').email)
        return done ? send(200, done) : send(404, { error: 'no such session' })
      }
      if ((control = /^\/__fake\/subscriptions\/([^/]+)$/.exec(url.pathname)) && req.method === 'POST') {
        const patched = this.account.patchSubscription(control[1]!, JSON.parse(body || '{}'))
        return patched ? send(200, patched) : send(404, { error: 'no such subscription' })
      }
      if (url.pathname === '/__stats') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(this.stats))
        return
      }
      const fault = this.takeFault(req.method ?? 'GET', url.pathname)
      if (fault?.mode === 'hang') return // hold the socket; the client's timeout decides
      if (fault?.mode === 'error') {
        return send(500, { error: { type: 'api_error', message: 'readiness Stripe stub: injected failure' } })
      }
      if (fault?.mode === 'slow') await new Promise((resolveDelay) => setTimeout(resolveDelay, fault.ms ?? 7_000))
      const reply: typeof send = fault?.mode === 'hang-after' ? () => undefined : send

      const match = /^\/v1\/prices\/([^/]+)$/.exec(url.pathname)
      const plan = (Object.keys(STUB_PRICES) as Array<keyof typeof STUB_PRICES>).find(
        (key) => match && STUB_PRICES[key] === decodeURIComponent(match[1]!),
      )
      if (req.method === 'GET' && plan) {
        this.stats.prices += 1
        return reply(200, price(plan))
      }
      const answered = this.account.handle(req.method ?? 'GET', url, body, {
        idempotencyKey: (req.headers['idempotency-key'] as string | undefined) ?? undefined,
      })
      if (answered) return reply(answered.status, answered.body)

      const key = `${req.method} ${url.pathname.replace(/\/[^/]*_[A-Za-z0-9]+/g, '/:id')}`
      this.stats.refused[key] = (this.stats.refused[key] ?? 0) + 1
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          error: { type: 'invalid_request_error', message: `readiness Stripe stub does not serve ${key}` },
        }),
      )
    })
    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve))
    return (this.server!.address() as AddressInfo).port
  }

  async close(): Promise<void> {
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

if (process.argv[1]?.endsWith('stripe-stub.ts')) {
  const port = Number(process.argv[2] ?? 3191)
  new StripeStub().listen(port).then((bound) => console.log(`Stripe stub on 127.0.0.1:${bound}`))
}
