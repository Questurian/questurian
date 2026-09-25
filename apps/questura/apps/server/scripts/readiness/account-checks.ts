/**
 * The account lifecycle, against the production build's real Better Auth
 * (launch fix plan item 14).
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:account
 *
 * Every device below keeps its five-minute session cookie copy
 * (`session_data`, Better Auth's `cookieCache`); nothing drops it by hand. A
 * revoked session must still end within seconds (`session-revocations.ts`).
 *
 *  - **password change.** Other devices are signed out even when the caller
 *    asks to keep them (the server forces it); this device stays in; the old
 *    password is refused.
 *  - **sign out of all devices.** `revoke-sessions` ends every device,
 *    including Better Auth's own endpoints on the revoked one.
 *  - **password reset.** Other devices are signed out; the link works once;
 *    an expired link is refused.
 *  - **email change.** Nothing moves until the link in the mail to the new
 *    address is followed; then sign-in, the account and the Stripe customer
 *    all carry the new address, and the old address is told.
 *  - **nightly email drift.** A Stripe customer whose address drifted is
 *    reported by the dry run, left alone by it, and put right by `--apply`.
 *  - **account deletion (D2).** The erase command refuses a live member,
 *    changes nothing on a dry run, and on `--apply` signs every device out,
 *    deletes the sign-in account and bookmarks, and deletes the profile (or
 *    empties it while it still names a Stripe customer).
 *
 * Creates its own throwaway readers (`@example.test`). Never touches
 * `member-a`, and only reads `member-b` (a dry run that must refuse).
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { Pool } from 'pg'

import { backendEnv, SERVER_DIR } from './apps'
import type { FakeMail } from './oauth-fake'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { freshRateLimits, readStackState, stackAppSettings, STACK_PORTS, type StackState } from './stack'

const run = promisify(execFile)

const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`
const AUTH = `${BACKEND}/api/visitor-auth`
const FAKE = `http://127.0.0.1:${STACK_PORTS.oauth}`
const STRIPE = `http://127.0.0.1:${STACK_PORTS.stripe}`
const DATA = '__Secure-questura_visitor.session_data'
const PASSWORD = 'Account-Probe-2026!'
const CHANGED = 'Account-Changed-2026!'
/** Revocation must reach every instance within one poll (1 s) plus the request; allow a margin. */
const WITHIN_MS = 3_000

type Check = { group: string; name: string; ok: boolean; detail: string }
const checks: Check[] = []
function record(group: string, name: string, ok: boolean, detail = ''): void {
  checks.push({ group, name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} [${group}] ${name}${ok ? '' : ` — ${detail}`}`)
}
function info(group: string, text: string): void {
  console.log(`  info [${group}] ${text}`)
}

let address = 0
const caller = () => {
  address += 1
  return `198.21.${Math.floor(address / 250)}.${(address % 250) + 1}`
}
const runId = Date.now().toString(36)
let serial = 0
const unique = (label: string) => `account-${label}-${runId}-${(serial += 1)}@example.test`

let origin = ''
let backendOrigin = ''
let pool: Pool
let stack: StackState

/** One device: its own cookie jar and its own address. */
class Device {
  readonly jar = new Map<string, string>()
  readonly ip = caller()

  cookie(): string {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  private absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const at = pair!.indexOf('=')
      const name = pair!.slice(0, at).trim()
      const value = pair!.slice(at + 1).trim()
      const expired = attributes.some((attribute) => {
        const [key, raw] = attribute.split('=').map((part) => part?.trim().toLowerCase())
        return (key === 'max-age' && Number(raw) <= 0) || (key === 'expires' && Date.parse(raw ?? '') < Date.now())
      })
      if (expired || value === '') this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }

  async request(url: string, init: { method?: string; body?: unknown; navigation?: boolean } = {}) {
    const target = url.startsWith(backendOrigin) ? `${BACKEND}${url.slice(backendOrigin.length)}` : url
    const method = init.method ?? 'GET'
    const response = await fetch(target, {
      method,
      redirect: 'manual',
      headers: {
        'cf-connecting-ip': this.ip,
        ...(init.navigation ? { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' } : { origin, 'sec-fetch-site': 'same-site' }),
        ...(method === 'GET' || method === 'DELETE' ? {} : { 'content-type': 'application/json' }),
        ...(this.jar.size ? { cookie: this.cookie() } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    this.absorb(response)
    const text = await response.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // Not JSON.
    }
    return { status: response.status, location: response.headers.get('location'), text, json }
  }

  post(path: string, body: unknown) {
    return this.request(`${AUTH}${path}`, { method: 'POST', body })
  }

  async me(): Promise<string | null> {
    const response = await this.request(`${BACKEND}/api/me`)
    return response.json?.authenticated ? (response.json.principal?.email ?? '?') : null
  }

  hasCacheCopy(): boolean {
    return this.jar.has(DATA)
  }
}

async function signUp(email: string): Promise<Device> {
  const device = new Device()
  const response = await device.post('/sign-up/email', { email, password: PASSWORD, name: 'Account Probe' })
  if (response.status !== 200) throw new Error(`sign-up answered ${response.status}: ${response.text.slice(0, 200)}`)
  return device
}

async function signIn(email: string, password = PASSWORD): Promise<Device> {
  const device = new Device()
  const response = await device.post('/sign-in/email', { email, password })
  if (response.status !== 200) throw new Error(`sign-in answered ${response.status}: ${response.text.slice(0, 200)}`)
  return device
}

async function signInStatus(email: string, password: string): Promise<number> {
  return (await new Device().post('/sign-in/email', { email, password })).status
}

/** How long until `/api/me` on this device says signed out, or null if it never does within the limit. */
async function signedOutWithin(device: Device, limitMs = WITHIN_MS + 2_000): Promise<number | null> {
  const started = performance.now()
  while (performance.now() - started < limitMs) {
    if ((await device.me()) === null) return Math.round(performance.now() - started)
    await new Promise((done) => setTimeout(done, 200))
  }
  return null
}

function endsInSeconds(group: string, label: string, elapsed: number | null): void {
  record(group, `${label} within ${WITHIN_MS / 1000} s, cache cookie kept`, elapsed !== null && elapsed <= WITHIN_MS, `elapsed ${elapsed ?? 'never'} ms`)
}

async function mailFor(email: string, subject: RegExp, since: string): Promise<FakeMail | null> {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const mail = (await (await fetch(`${FAKE}/__control/mail?to=${encodeURIComponent(email)}`)).json()) as FakeMail[]
    const hit = mail.find((entry) => subject.test(entry.subject) && entry.at >= since)
    if (hit) return hit
    await new Promise((done) => setTimeout(done, 250))
  }
  return null
}

async function verifyEmail(device: Device, email: string, since: string): Promise<void> {
  const mail = await mailFor(email, /verif/i, since)
  const link = mail?.links.find((entry) => entry.includes('/verify-email'))
  if (!link) throw new Error(`no verification mail for ${email}`)
  await device.request(link, { navigation: true })
}

async function fakeCustomer(id: string): Promise<{ email?: string | null; metadata?: Record<string, string> }> {
  return (await (await fetch(`${STRIPE}/v1/customers/${id}`)).json()) as { email?: string | null }
}

async function setFakeCustomerEmail(id: string, email: string): Promise<void> {
  const response = await fetch(`${STRIPE}/v1/customers/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email }).toString(),
  })
  if (!response.ok) throw new Error(`fake Stripe answered ${response.status}`)
}

async function userId(email: string): Promise<string | null> {
  return (await pool.query<{ id: string }>(`SELECT id FROM visitor_auth_users WHERE lower(email) = lower($1)`, [email])).rows[0]?.id ?? null
}

/** A server script, run the way the nightly or an operator runs it, with the sandbox backend's environment. */
async function script(file: string, args: string[]): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, ['--import', 'tsx', file, ...args], {
      cwd: SERVER_DIR(),
      env: backendEnv(stackAppSettings(stack)),
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { code: 0, out: `${stdout}${stderr}` }
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string }
    return { code: typeof failed.code === 'number' ? failed.code : 1, out: `${failed.stdout ?? ''}${failed.stderr ?? ''}` }
  }
}

// ------------------------------------------------------------------ groups

async function passwordChange(): Promise<string> {
  const group = 'password change'
  const email = unique('chpw')
  const here = await signUp(email)
  const other = await signIn(email)
  record(group, 'the other device holds a cookie copy of its session', other.hasCacheCopy())
  record(group, 'the other device is signed in', (await other.me()) === email)

  // The client asks for other sessions to end; a caller that asks not to must not be able to keep them.
  const change = await here.post('/change-password', { currentPassword: PASSWORD, newPassword: CHANGED, revokeOtherSessions: false })
  record(group, 'the change answers 200', change.status === 200, `HTTP ${change.status} ${change.text.slice(0, 120)}`)
  endsInSeconds(group, 'the other device is signed out even though the caller asked to keep it,', await signedOutWithin(other))
  record(group, 'this device stays signed in', (await here.me()) === email)
  const fresh = await here.request(`${AUTH}/get-session?disableCookieCache=true`)
  record(group, '…with a session the store honours', fresh.json?.user?.email === email, `HTTP ${fresh.status}`)
  record(group, 'the old password is refused', (await signInStatus(email, PASSWORD)) === 401)
  record(group, 'the new password signs in', (await signInStatus(email, CHANGED)) === 200)
  return email
}

async function signOutEverywhere(): Promise<void> {
  const group = 'sign out everywhere'
  const email = unique('everywhere')
  const here = await signUp(email)
  const phone = await signIn(email)
  const laptop = await signIn(email)
  record(group, 'three devices signed in, each with a cookie copy', (await phone.me()) === email && (await laptop.me()) === email && phone.hasCacheCopy() && laptop.hasCacheCopy())

  const revoke = await here.post('/revoke-sessions', {})
  record(group, 'revoke-sessions answers 200', revoke.status === 200, `HTTP ${revoke.status} ${revoke.text.slice(0, 120)}`)
  endsInSeconds(group, 'the phone is signed out', await signedOutWithin(phone))
  endsInSeconds(group, 'the laptop is signed out', await signedOutWithin(laptop))
  endsInSeconds(group, 'this device is signed out too', await signedOutWithin(here))
  const accounts = await laptop.request(`${AUTH}/list-accounts`)
  record(group, "Better Auth's own endpoints refuse the revoked device at once", accounts.status === 401, `HTTP ${accounts.status}`)
  const details = await phone.request(`${BACKEND}/api/payments/subscription-details`)
  record(group, 'payments refuse it at once', details.status === 401, `HTTP ${details.status}`)
  record(group, 'the password still signs in afterwards', (await signInStatus(email, PASSWORD)) === 200)
}

async function passwordReset(): Promise<void> {
  const group = 'password reset'
  const email = unique('reset')
  const other = await signUp(email)
  record(group, 'the other device holds a cookie copy of its session', other.hasCacheCopy())

  const requestReset = async () => {
    const since = new Date().toISOString()
    const asked = await new Device().post('/request-password-reset', { email, redirectTo: `${origin}/auth/reset-password` })
    if (asked.status !== 200) throw new Error(`request-password-reset answered ${asked.status}`)
    const mail = await mailFor(email, /reset/i, since)
    const link = mail?.links.find((entry) => entry.includes('reset-password'))
    if (!link) throw new Error(`no reset mail for ${email}`)
    const url = new URL(link)
    return url.searchParams.get('token') ?? /reset-password\/([^/?#]+)/.exec(url.pathname)?.[1] ?? ''
  }

  const token = await requestReset()
  const reset = await new Device().post('/reset-password', { token, newPassword: CHANGED })
  record(group, 'the link sets a new password', reset.status === 200, `HTTP ${reset.status} ${reset.text.slice(0, 120)}`)
  endsInSeconds(group, 'the signed-in device is signed out', await signedOutWithin(other))
  const again = await new Device().post('/reset-password', { token, newPassword: 'Account-Again-2026!' })
  record(group, 'the same link again is refused', again.status === 400, `HTTP ${again.status}`)

  const late = await requestReset()
  const expired = await pool.query(
    `UPDATE visitor_auth_verifications SET "expiresAt" = now() - interval '1 minute' WHERE value = $1 RETURNING 1`,
    [await userId(email)],
  )
  const refused = await new Device().post('/reset-password', { token: late, newPassword: 'Account-Late-2026!' })
  record(group, 'an expired link is refused', (expired.rowCount ?? 0) > 0 && refused.status === 400, `expired ${expired.rowCount}, HTTP ${refused.status}`)
  record(group, 'only the first reset took', (await signInStatus(email, CHANGED)) === 200 && (await signInStatus(email, 'Account-Late-2026!')) === 401)
}

/** Returns the reader (now at `moved`) and their Stripe customer id. */
async function emailChange(): Promise<{ moved: string; customerId: string }> {
  const group = 'email change'
  const email = unique('chmail-old')
  const moved = unique('chmail-new')
  const since = new Date().toISOString()
  const device = await signUp(email)
  await verifyEmail(device, email, since)

  // A Stripe customer, the way a reader gets one: opening checkout.
  const checkout = await device.request(`${BACKEND}/api/payments/create-checkout-session`, { method: 'POST', body: { plan: 'monthly' } })
  const customerId = (
    await pool.query<{ stripe_customer_id: string | null }>(`SELECT stripe_customer_id FROM visitor_profiles WHERE auth_user_id = $1`, [await userId(email)])
  ).rows[0]?.stripe_customer_id
  if (checkout.status !== 200 || !customerId) throw new Error(`checkout answered ${checkout.status}, customer ${customerId}: ${checkout.text.slice(0, 200)}`)
  record(group, 'the Stripe customer starts with the old address', (await fakeCustomer(customerId)).email === email)

  const changeSince = new Date().toISOString()
  const change = await device.post('/change-email', { newEmail: moved, callbackURL: `${origin}/account/email-changed-success` })
  record(group, 'change-email answers 200', change.status === 200, `HTTP ${change.status} ${change.text.slice(0, 120)}`)
  record(group, 'nothing moves before the link is followed', (await device.me()) === email && (await userId(moved)) === null)

  const mail = await mailFor(moved, /verif|confirm|email/i, changeSince)
  const link = mail?.links.find((entry) => entry.includes('/verify-email'))
  record(group, 'the new address gets a verification link', Boolean(link))
  if (!link) throw new Error('no change-email link')
  await device.request(link, { navigation: true })

  record(group, 'the account now has the new address', (await userId(moved)) !== null && (await userId(email)) === null)
  record(group, 'this device reads as the new address', (await device.me()) === moved)
  record(group, 'the Stripe customer has the new address', (await fakeCustomer(customerId)).email === moved)
  record(group, 'the old address is told', Boolean(await mailFor(email, /email/i, changeSince)))
  record(group, 'the new address signs in', (await signInStatus(moved, PASSWORD)) === 200)
  record(group, 'the old address no longer does', (await signInStatus(email, PASSWORD)) === 401)
  return { moved, customerId }
}

async function emailDrift(customerId: string, moved: string): Promise<void> {
  const group = 'nightly email drift'
  const stale = unique('stale')
  await setFakeCustomerEmail(customerId, stale)

  const dry = await script('scripts/sync-stripe-customer-emails.ts', [])
  record(group, 'the dry run reports the drifted customer', dry.code === 0 && dry.out.includes(`DRIFT     ${customerId}`), dry.out.slice(-400))
  record(group, '…and changes nothing', (await fakeCustomer(customerId)).email === stale)
  record(group, '…and prints no address', !dry.out.includes('@'))

  const applied = await script('scripts/sync-stripe-customer-emails.ts', ['--apply', '--max-apply', '25'])
  record(group, '--apply puts the account address back', applied.code === 0 && (await fakeCustomer(customerId)).email === moved, applied.out.slice(-400))
  const after = await script('scripts/sync-stripe-customer-emails.ts', [])
  record(group, 'the next run finds it in step', after.code === 0 && !after.out.includes(`DRIFT     ${customerId}`), after.out.slice(-400))
}

async function erasure(withStripe: string, withoutStripe: string): Promise<void> {
  const group = 'account deletion'
  const erase = (email: string, apply = false) => script('scripts/erase-visitor-account.ts', ['--email', email, ...(apply ? ['--apply'] : [])])

  const member = await erase('member-b@example.com')
  record(group, 'a live member is refused (cancel in Stripe first)', member.code === 1 && member.out.includes('ERASE refused'), member.out.slice(-300))

  // The reader with a Stripe customer: two devices and a bookmark.
  const password = PASSWORD
  const one = await signIn(withStripe, password)
  const two = await signIn(withStripe, password)
  const article = (await pool.query<{ id: number }>(`SELECT id FROM articles WHERE status = 'published' ORDER BY id LIMIT 1`)).rows[0]?.id
  const bookmark = await one.request(`${BACKEND}/api/account/bookmarks`, { method: 'POST', body: { targetType: 'articles', targetId: article } })
  record(group, 'setup: a bookmark is saved', bookmark.status < 300, `HTTP ${bookmark.status} ${bookmark.text.slice(0, 120)}`)
  const id = await userId(withStripe)

  const dry = await erase(withStripe)
  record(group, 'the dry run lists what would go', dry.code === 0 && /ERASE dry-run sessions=\d+ sign_in_methods=1 bookmarks=1 profile=emptied/.test(dry.out), dry.out.slice(-300))
  record(group, '…and changes nothing', (await userId(withStripe)) === id && (await one.me()) === withStripe)

  const done = await erase(withStripe, true)
  record(group, '--apply erases', done.code === 0 && done.out.includes('ERASE done'), done.out.slice(-300))
  endsInSeconds(group, 'the first device is signed out', await signedOutWithin(one))
  endsInSeconds(group, 'the second device is signed out', await signedOutWithin(two))
  record(group, 'the address no longer signs in', (await signInStatus(withStripe, password)) === 401)
  const left = await pool.query<{ users: string; accounts: string; sessions: string; bookmarks: string }>(
    `SELECT (SELECT count(*) FROM visitor_auth_users WHERE id = $1) AS users,
            (SELECT count(*) FROM visitor_auth_accounts WHERE "userId" = $1) AS accounts,
            (SELECT count(*) FROM visitor_auth_sessions WHERE "userId" = $1) AS sessions,
            (SELECT count(*) FROM bookmarks WHERE auth_user_id = $1) AS bookmarks`,
    [id],
  )
  const row = left.rows[0]!
  record(group, 'no user, sign-in method, session or bookmark is left', [row.users, row.accounts, row.sessions, row.bookmarks].every((n) => Number(n) === 0), JSON.stringify(row))
  const profile = (
    await pool.query<{ email: string; first_name: string | null; stripe_customer_id: string | null }>(
      `SELECT email, first_name, stripe_customer_id FROM visitor_profiles WHERE auth_user_id = $1`,
      [id],
    )
  ).rows[0]
  record(
    group,
    'the profile that names a Stripe customer is emptied, the billing link kept',
    Boolean(profile) && profile!.email.endsWith('@erased.invalid') && profile!.first_name === null && Boolean(profile!.stripe_customer_id),
    JSON.stringify(profile ?? null),
  )
  const twice = await erase(withStripe)
  record(group, 'a second run finds nothing', twice.code === 0 && twice.out.includes('ERASE none'), twice.out.slice(-200))

  // A reader who never reached Stripe: the profile goes entirely.
  const plainId = await userId(withoutStripe)
  const plain = await erase(withoutStripe, true)
  const plainProfile = await pool.query(`SELECT 1 FROM visitor_profiles WHERE auth_user_id = $1`, [plainId])
  record(group, 'without a Stripe customer the profile is deleted', plain.code === 0 && plain.out.includes('profile=deleted') && plainProfile.rowCount === 0, plain.out.slice(-300))
}

async function main(): Promise<void> {
  const sandbox = sandboxSettings()
  assertPreflight(sandbox)
  const state = readStackState()
  if (!state) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  stack = state
  if (!stack.processes.some((process_) => process_.role === 'oauth-fake')) {
    throw new Error('This stack has no fake mailbox. Restart it: pnpm readiness:stack -- down && pnpm readiness:stack -- up')
  }
  if (new URL(sandbox.databaseUri).pathname !== '/questura_readiness') throw new Error('Refusing a database that is not the sandbox’s own.')
  // Scripts run back to back share the per-address budgets; start from zero.
  await freshRateLimits()
  origin = stack.origins.client
  backendOrigin = stack.origins.backend
  pool = new Pool({ connectionString: sandbox.databaseUri, max: 2 })

  try {
    const changedPassword = await passwordChange()
    await signOutEverywhere()
    await passwordReset()
    const { moved, customerId } = await emailChange()
    await emailDrift(customerId, moved)
    // The password-change reader now signs in with CHANGED; the erase script needs no password.
    info('account deletion', 'erasing the email-change reader (Stripe customer) and the password-change reader (none)')
    await erasure(moved, changedPassword)
  } finally {
    await pool.end()
  }

  const failed = checks.filter((check) => !check.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} account checks passed.`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(2)
})
