import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'

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
 * SQL against the sandbox database, through the sandbox container only. The
 * name is fixed: this never reaches `questura-postgres` (the live data).
 */
export function sandboxSql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', 'questura-readiness-pg', 'psql', '-U', 'postgres', '-d', 'questura_readiness', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8', timeout: 15_000 },
  ).trim()
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
