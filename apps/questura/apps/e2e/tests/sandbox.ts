import { execFileSync, spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'

import type { Page } from '@playwright/test'

import { HOME_PATH, expect, freshEmail, signUp } from './fixtures'

/**
 * The readiness sandbox's fakes, as the journeys that write use them. Only
 * ever loopback: fake Stripe (:3191), fake Google and its mailbox (:3192), the
 * API through its Cloudflare stand-in (:4100) and the sandbox Postgres
 * container. Specs that import this skip themselves outside the sandbox.
 */

export const FAKE_STRIPE = 'http://127.0.0.1:3191'
export const FAKE_PROVIDER = 'http://127.0.0.1:3192'
export const API = 'http://127.0.0.1:4100'

/** `SANDBOX_WEBHOOK_SECRET` in `server/scripts/readiness/apps.ts`: a placeholder, never a real host's. */
const SANDBOX_WEBHOOK_SECRET = 'whsec_readiness_placeholder'

type Json = Record<string, unknown>
export type Mail = { at: string; to: string[]; subject: string; links: string[] }

/** The newest mail to `to` whose subject matches, sent at or after `since`. */
export async function mailTo(to: string, subject: RegExp, since: string): Promise<Mail> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const mail = (await (await fetch(`${FAKE_PROVIDER}/__control/mail?to=${encodeURIComponent(to)}`)).json()) as Mail[]
    const hit = mail.find((entry) => subject.test(entry.subject) && entry.at >= since)
    if (hit) return hit
    await new Promise((done) => setTimeout(done, 250))
  }
  throw new Error(`No mail to ${to} matching ${subject} since ${since}`)
}

export async function fakeStripe(path: string, body?: unknown): Promise<Json> {
  const response = await fetch(`${FAKE_STRIPE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`fake Stripe ${path} answered ${response.status}`)
  return (await response.json()) as Json
}

/** Tell the app what Stripe did, the way Stripe does: a webhook signed with the sandbox secret. */
export async function deliverWebhook(type: string, object: unknown): Promise<number> {
  const payload = JSON.stringify({
    id: `evt_fake${randomBytes(9).toString('hex')}`,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object },
  })
  const t = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', SANDBOX_WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')
  const response = await fetch(`${API}/api/payments/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}`, 'cf-connecting-ip': '198.18.99.1' },
    body: payload,
  })
  return response.status
}

/**
 * SQL against the sandbox database only: through the sandbox container, or,
 * on a host with no docker, through `psql` to that host's own sandbox
 * Postgres on 127.0.0.1:5442. Neither can reach `questura-postgres` (the live
 * data) or any other port.
 */
export function sandboxSql(sql: string): string {
  const psql = ['-d', 'questura_readiness', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]
  const [command, args] = hasDocker()
    ? ['docker', ['exec', '-i', 'questura-readiness-pg', 'psql', '-U', 'postgres', ...psql]]
    : ['psql', ['-h', '127.0.0.1', '-p', '5442', '-U', 'postgres', ...psql]]
  return execFileSync(command, args, { encoding: 'utf8', timeout: 15_000 }).trim()
}

function hasDocker(): boolean {
  return spawnSync('sh', ['-c', 'command -v docker'], { stdio: 'ignore' }).status === 0
}

/** Make every outstanding verification token (reset, email) of this reader expire now. */
export function expireTokensOf(email: string): number {
  if (!/^[a-z0-9.+-]+@example\.com$/.test(email)) throw new Error(`Refusing to touch ${email}: journeys only use @example.com readers`)
  const out = sandboxSql(
    `UPDATE visitor_auth_verifications SET "expiresAt" = now() - interval '1 minute'
     WHERE value = (SELECT id::text FROM visitor_auth_users WHERE lower(email) = lower('${email}')) RETURNING 1`,
  )
  return out ? out.split('\n').length : 0
}

/**
 * Make the API's front door answer `status` itself for every request whose
 * path and query contain `match` (`front-door-edge.ts`), or clear it with
 * `null`. Stands for the API being down for one page.
 */
export async function edgeFault(fault: { status: number; match: string } | null): Promise<void> {
  const response = await fetch(`${API}/__edge/fault`, { method: 'POST', body: JSON.stringify(fault) })
  if (!response.ok) throw new Error(`edge fault answered ${response.status}`)
}

type Plan = 'monthly' | 'yearly'
export type Purchase = { email: string; subscription: Json & { id: string; current_period_end: number } }

/**
 * A new reader signs up from the header, verifies through the fake mailbox,
 * and buys `plan` on the purchase page. The payment is the fake's, told to the
 * app with a signed webhook, as in journey 2. Ends on the success page's
 * destination; real Stripe is never reached (the context refuses it).
 */
export async function buyMembership(page: Page, plan: Plan): Promise<Purchase> {
  const context = page.context()
  await context.route(/^https:\/\/([a-z-]+\.)?stripe\.com\//, (route) =>
    route.fulfill({ status: 418, body: 'real Stripe is out of bounds in the sandbox' }),
  )
  await context.route(`${FAKE_STRIPE}/__fake/pay/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Fake Checkout</title><h1>Fake Checkout</h1>' }),
  )

  const email = freshEmail(`buy-${plan}`)
  const since = new Date().toISOString()
  await page.goto(HOME_PATH)
  await signUp(page, email)
  const verification = await mailTo(email, /verif/i, since)
  const link = verification.links.find((href) => href.includes('verify-email'))
  if (!link) throw new Error(`No verify-email link in ${JSON.stringify(verification.links)}`)
  // The link returns the reader to `/`, which the sandbox cannot show (its
  // default city is the real site's). Journey 2 follows the link as sent; here
  // it lands on the sandbox's home instead, and is let settle so the next
  // navigation is not cancelled under a redirect.
  const verify = new URL(link)
  verify.searchParams.set('callbackURL', new URL(HOME_PATH, page.url()).toString())
  await page.goto(verify.toString())
  await page.waitForLoadState('networkidle')

  await page.goto(`/purchase/${plan}`)
  const subscribe = page.getByRole('button', { name: /^Subscribe Now/ })
  await expect(subscribe).toBeEnabled()
  await subscribe.click()
  await page.waitForURL(new RegExp(`^${FAKE_STRIPE}/__fake/pay/`))
  const sessionId = new URL(page.url()).pathname.split('/').pop()!

  const paid = await fakeStripe(`/__fake/checkout/${sessionId}/complete`, { email })
  const delivered = await deliverWebhook('checkout.session.completed', paid.session)
  if (delivered !== 200) throw new Error(`checkout.session.completed answered ${delivered}`)
  const session = paid.session as { success_url: string }
  await page.goto(session.success_url.replace('{CHECKOUT_SESSION_ID}', sessionId))
  await expect(page).not.toHaveURL((url) => url.pathname.startsWith('/subscription/success'), { timeout: 15_000 })
  return { email, subscription: paid.subscription as Purchase['subscription'] }
}
