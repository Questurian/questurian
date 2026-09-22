import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { MEMBERSHIP_CATALOG } from '../../src/features/payments/lib/membership-catalog'

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
 * (`getPurchasablePlan`) passes for the reason it would in production. Every
 * other request — a checkout, a customer, a webhook call — gets a 400 and is
 * counted, so a journey that reaches for a payment fails loudly and the run
 * report says so. Nothing here can take money; nothing here talks to Stripe.
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

export class StripeStub {
  readonly stats: StripeStubStats = { prices: 0, refused: {} }
  private server: Server | null = null

  async listen(port: number): Promise<number> {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/__stats') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(this.stats))
        return
      }
      const match = /^\/v1\/prices\/([^/]+)$/.exec(url.pathname)
      const plan = (Object.keys(STUB_PRICES) as Array<keyof typeof STUB_PRICES>).find(
        (key) => match && STUB_PRICES[key] === decodeURIComponent(match[1]!),
      )
      if (req.method === 'GET' && plan) {
        this.stats.prices += 1
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(price(plan)))
        return
      }
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
