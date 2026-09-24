/**
 * Google account linking and the staff/visitor boundary, attacked, against
 * the production build's real Better Auth and real Payload (launch harness
 * B4).
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:oauth
 *
 * Google is the fake in `oauth-fake.ts`; the stack's backend reaches it
 * through `oauth-fake-route.cjs`, a harness-only preload. The app has no
 * setting that moves Google, and gains none here. The harness plays each
 * browser itself: its own cookie jar and its own client address, following
 * the redirects a browser would follow.
 *
 * What Better Auth is configured to do (visitor-auth/lib/better-auth.ts):
 * `accountLinking.disableImplicitLinking: true`. Signing in with Google never
 * attaches itself to an account that already exists under that address,
 * verified or not, whichever side is verified; the reader is sent to the
 * error page with `account_not_linked`. Linking is explicit, from a signed-in
 * session (`/link-social`), for the same address only
 * (`allowDifferentEmails: false`).
 *
 *  - **linking.** Password then Google with the same verified address: not
 *    linked, not signed in, password untouched. The same with an unverified
 *    local account and with an unverified Google address. Explicit linking
 *    from the account itself works and then lands on the same user.
 *  - **google first.** A Google account, then a password reset for its
 *    address: the reset mail arrives, the new password reaches the same
 *    user, other sessions are signed out. An *unverified* Google address
 *    never shares an account with the address's real owner.
 *  - **same email.** Two Google accounts claiming one address, and a Google
 *    account whose address later becomes someone else's.
 *  - **state.** A callback replayed, carried to another browser (login CSRF),
 *    with its state or code tampered, or with another flow's code (PKCE).
 *  - **id token.** The `idToken` sign-in path of `/sign-in/social`.
 *  - **staff.** A visitor cookie never opens `/admin` or a staff API; a staff
 *    cookie or JWT is never a visitor or a member; signing out of one leaves
 *    the other; one address never holds both.
 */

import { generateKeyPairSync } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

import { Pool } from 'pg'

import { STAFF_EMAIL, SYNTHETIC_PASSWORD } from './launch-corpus'
import { FAKE_GOOGLE, type FakeGoogleIdentity, type FakeMail, type FakeStats, signJwt } from './oauth-fake'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { freshRateLimits, readStackState, STACK_PORTS } from './stack'

const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`
const AUTH = `${BACKEND}/api/visitor-auth`
const FAKE = `http://127.0.0.1:${STACK_PORTS.oauth}`
const TOKEN = '__Secure-questura_visitor.session_token'
const STATE = '__Secure-questura_visitor.state'
const MEMBER_ARTICLE = `${BACKEND}/api/public/articles/full?type=articles&id=1&lang=en`

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
  return `198.18.${Math.floor(address / 250)}.${(address % 250) + 1}`
}
const run = Date.now().toString(36)
let serial = 0
const unique = (label: string) => `oauth-${label}-${run}-${(serial += 1)}@example.test`
const googleSub = () => `1${String(Date.now()).slice(-9)}${String((serial += 1)).padStart(8, '0')}`

let origin = ''
let backendOrigin = ''

/** One browser: its own cookie jar and its own address. */
class Browser {
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

  /**
   * `navigation` is a top-level visit (a redirect back from Google, a link in
   * an email): no Origin, and `Sec-Fetch-Site` saying where it came from.
   * Anything else is the site's own `fetch`, which carries the client's Origin.
   */
  async request(
    url: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string>; navigation?: 'cross-site' | 'none' } = {},
  ) {
    const target = url.startsWith(backendOrigin) ? `${BACKEND}${url.slice(backendOrigin.length)}` : url
    const method = init.method ?? 'GET'
    const response = await fetch(target, {
      method,
      redirect: 'manual',
      headers: {
        'cf-connecting-ip': this.ip,
        ...(init.navigation ? { 'sec-fetch-site': init.navigation, 'sec-fetch-mode': 'navigate' } : { origin, 'sec-fetch-site': 'same-site' }),
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...(this.jar.size ? { cookie: this.cookie() } : {}),
        ...init.headers,
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

  /** Who `/api/me` says this browser is. */
  async me(): Promise<{ id: string | null; email: string | null; member: boolean }> {
    const response = await this.request(`${BACKEND}/api/me`)
    const principal = response.json?.authenticated ? response.json.principal : null
    return { id: principal?.id ?? null, email: principal?.email ?? null, member: Boolean(principal?.membership?.active) }
  }

  /** The session store's answer, skipping the five-minute cookie cache. */
  async freshSession(): Promise<{ id: string; email: string } | null> {
    const response = await this.request(`${AUTH}/get-session?disableCookieCache=true`)
    return response.json?.user ? { id: response.json.user.id, email: response.json.user.email } : null
  }
}

// ---------------------------------------------------------------- the fake

const encodeIdentity = (identity: FakeGoogleIdentity) => Buffer.from(JSON.stringify(identity)).toString('base64url')

function google(email: string, verified = true, sub = googleSub()): FakeGoogleIdentity {
  return { sub, email, email_verified: verified, name: 'Readiness Google' }
}

async function fakeStats(): Promise<FakeStats> {
  return (await (await fetch(`${FAKE}/__control/stats`)).json()) as FakeStats
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

type Landing = { status: number; location: string | null; error: string | null; signedIn: boolean; text: string }

/** Start a Google flow the way the client's button does; answer the authorize URL. */
async function startGoogle(browser: Browser, kind: 'sign-in' | 'link' = 'sign-in'): Promise<URL> {
  const response = await browser.post(kind === 'sign-in' ? '/sign-in/social' : '/link-social', {
    provider: 'google',
    callbackURL: `${origin}/account`,
    errorCallbackURL: `${origin}/auth-error`,
  })
  if (response.status !== 200 || !response.json?.url) throw new Error(`${kind} answered ${response.status}: ${response.text.slice(0, 200)}`)
  return new URL(response.json.url)
}

/** The consent screen: who is signed in to Google decides whose code comes back. */
async function consent(authorize: URL, identity: FakeGoogleIdentity): Promise<string> {
  const screen = new URL(`${FAKE}/o/oauth2/v2/auth${authorize.search}`)
  screen.searchParams.set('readiness_as', encodeIdentity(identity))
  const response = await fetch(screen, { redirect: 'manual' })
  const location = response.headers.get('location')
  if (response.status !== 302 || !location) throw new Error(`fake consent answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return location
}

async function land(browser: Browser, callback: string): Promise<Landing> {
  const before = browser.jar.get(TOKEN)
  const response = await browser.request(callback, { navigation: 'cross-site' })
  let error: string | null = null
  if (response.location) {
    try {
      error = new URL(response.location, backendOrigin).searchParams.get('error')
    } catch {
      // Unparseable; left null.
    }
  }
  const after = browser.jar.get(TOKEN)
  return { status: response.status, location: response.location, error, signedIn: Boolean(after) && after !== before, text: response.text }
}

async function googleSignIn(browser: Browser, identity: FakeGoogleIdentity): Promise<Landing> {
  return land(browser, await consent(await startGoogle(browser), identity))
}

const landed = (landing: Landing) =>
  `HTTP ${landing.status} → ${landing.location ?? '(no redirect)'}${landing.signedIn ? ', signed in' : ''}${landing.status >= 400 ? ` ${landing.text.slice(0, 120)}` : ''}`
const toAccount = (landing: Landing) => landing.status === 302 && landing.location === `${origin}/account` && landing.signedIn
const refusedWith = (landing: Landing, error: string) =>
  landing.status === 302 && landing.error === error && !landing.signedIn && !(landing.location ?? '').startsWith(`${origin}/account`)
const notSignedIn = (landing: Landing) => !landing.signedIn && !(landing.location ?? '').startsWith(`${origin}/account`)

// ---------------------------------------------------------------- accounts

let pool: Pool

async function userRows(email: string): Promise<Array<{ id: string; emailVerified: boolean }>> {
  const result = await pool.query(`SELECT id, "emailVerified" FROM visitor_auth_users WHERE lower(email) = lower($1)`, [email])
  return result.rows
}

async function providers(userId: string): Promise<string[]> {
  const result = await pool.query(`SELECT "providerId" FROM visitor_auth_accounts WHERE "userId" = $1 ORDER BY "providerId"`, [userId])
  return result.rows.map((row) => row.providerId as string)
}

async function googleOwner(sub: string): Promise<string | null> {
  const result = await pool.query(`SELECT "userId" FROM visitor_auth_accounts WHERE "providerId" = 'google' AND "accountId" = $1`, [sub])
  return (result.rows[0]?.userId as string | undefined) ?? null
}

const PASSWORD = 'Oauth-Probe-2026!'

/** A password account, verified through the link it is mailed when asked to be. */
async function passwordAccount(email: string, verify: boolean): Promise<string> {
  const since = new Date().toISOString()
  const browser = new Browser()
  const response = await browser.post('/sign-up/email', { email, password: PASSWORD, name: 'Oauth Probe' })
  if (response.status !== 200) throw new Error(`sign-up ${email} answered ${response.status}: ${response.text.slice(0, 200)}`)
  const id = response.json.user.id as string
  if (verify) {
    const mail = await mailFor(email, /verif/i, since)
    const link = mail?.links.find((entry) => entry.includes('/verify-email'))
    if (!link) throw new Error(`no verification mail for ${email}`)
    await new Browser().request(link, { navigation: 'none' })
    if (!(await userRows(email))[0]?.emailVerified) throw new Error(`${email} is still unverified after its link`)
  }
  return id
}

async function passwordSignIn(email: string, password = PASSWORD): Promise<Browser> {
  const browser = new Browser()
  await browser.post('/sign-in/email', { email, password })
  return browser
}

// ---------------------------------------------------------------- staff

async function staffLogin(): Promise<{ token: string; cookie: string }> {
  const attempt = () =>
    fetch(`${BACKEND}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': caller() },
      body: JSON.stringify({ email: STAFF_EMAIL, password: SYNTHETIC_PASSWORD }),
    })
  let response = await attempt()
  // Staff sign-in allows five a minute per address, and other readiness runs
  // sign in as the same synthetic admin. Wait out the limit once.
  if (response.status === 429) {
    const wait = Math.min(Number(response.headers.get('retry-after') ?? 60), 65)
    info('staff', `staff sign-in is rate limited; waiting ${wait} s`)
    await new Promise((done) => setTimeout(done, wait * 1000))
    response = await attempt()
  }
  const token = ((await response.json()) as { token?: string }).token
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0]!)
    .find((pair) => pair.startsWith('payload-token='))
  if (!token || !cookie) throw new Error(`staff login answered ${response.status}`)
  return { token, cookie }
}

async function main(): Promise<void> {
  const sandbox = sandboxSettings()
  assertPreflight(sandbox)
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  // Scripts run back to back share the per-address budgets; start from zero.
  await freshRateLimits()
  if (!stack.processes.some((process_) => process_.role === 'oauth-fake')) {
    throw new Error('This stack has no fake Google. Restart it: pnpm readiness:stack -- down && pnpm readiness:stack -- up')
  }
  if (new URL(sandbox.databaseUri).pathname !== '/questura_readiness') throw new Error('Refusing a database that is not the sandbox’s own.')
  origin = stack.origins.client
  backendOrigin = stack.origins.backend
  pool = new Pool({ connectionString: sandbox.databaseUri, max: 2 })

  try {
    await linking()
    await googleFirst()
    await sameEmail()
    await state()
    await idToken()
    await staff()
  } finally {
    await pool.end()
  }

  // Everything above reached the fake; nothing tried the real Google or Resend.
  const outbound = existsSync(stack.outboundLog) ? readFileSync(stack.outboundLog, 'utf8') : ''
  const tried = outbound.split('\n').filter((line) => /google|resend/i.test(line))
  record('outbound', 'nothing tried to reach the real Google or Resend', tried.length === 0, tried.slice(0, 3).join(' | '))

  const failed = checks.filter((check) => !check.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} oauth checks passed.`)
  if (failed.length > 0) process.exit(1)
}

// ------------------------------------------------------------------ linking

async function linking(): Promise<void> {
  const group = 'linking'

  // The flow itself, before anything is attacked.
  const probe = new Browser()
  const authorize = await startGoogle(probe)
  record(
    group,
    'the authorize request is Google-shaped: our client, our callback, PKCE S256, a state',
    authorize.origin === 'https://accounts.google.com' &&
      authorize.searchParams.get('client_id') === FAKE_GOOGLE.clientId &&
      authorize.searchParams.get('redirect_uri') === `${backendOrigin}/api/visitor-auth/callback/google` &&
      authorize.searchParams.get('code_challenge_method') === 'S256' &&
      Boolean(authorize.searchParams.get('state')) &&
      probe.jar.has(STATE),
    authorize.toString().replace(/state=[^&]+/, 'state=…'),
  )
  const fresh = unique('fresh')
  const first = await land(probe, await consent(authorize, google(fresh)))
  record(group, 'a new verified Google address signs up and lands on the callback URL', toAccount(first), landed(first))
  record(group, '…as that address', (await probe.me()).email === fresh)

  // A password account, verified, then Google with the same verified address.
  const verifiedEmail = unique('verified')
  const verifiedId = await passwordAccount(verifiedEmail, true)
  const takeover = google(verifiedEmail)
  const attempt = await googleSignIn(new Browser(), takeover)
  record(group, 'password (verified) then Google (verified), same address: not linked, account_not_linked', refusedWith(attempt, 'account_not_linked'), landed(attempt))
  record(group, '…no Google account attached to it', !(await providers(verifiedId)).includes('google') && (await googleOwner(takeover.sub)) === null, (await providers(verifiedId)).join(','))
  record(group, '…and its password still signs in', (await (await passwordSignIn(verifiedEmail)).me()).email === verifiedEmail)
  record(group, '…and no second account under the address', (await userRows(verifiedEmail)).length === 1)

  // Unverified local account, verified Google.
  const unverifiedEmail = unique('unverified-local')
  const unverifiedId = await passwordAccount(unverifiedEmail, false)
  const squat = await googleSignIn(new Browser(), google(unverifiedEmail))
  record(group, 'password (unverified) then Google (verified): not linked, not signed in', refusedWith(squat, 'account_not_linked'), landed(squat))
  const squatRow = (await userRows(unverifiedEmail))[0]
  record(group, '…the local account is not marked verified by Google', squatRow?.emailVerified === false && !(await providers(unverifiedId)).includes('google'), JSON.stringify(squatRow))

  // Verified local account, unverified Google.
  const unverifiedGoogle = await googleSignIn(new Browser(), google(verifiedEmail, false))
  record(group, 'password (verified) then Google (unverified): refused, google_email_unverified', refusedWith(unverifiedGoogle, 'google_email_unverified') && !(await providers(verifiedId)).includes('google'), landed(unverifiedGoogle))

  // Explicit linking from the account's own session.
  const owner = await passwordSignIn(verifiedEmail)
  const link = await land(owner, await consent(await startGoogle(owner, 'link'), takeover))
  record(group, 'explicit link from a signed-in session attaches Google', link.status === 302 && (await googleOwner(takeover.sub)) === verifiedId, landed(link))
  const afterLink = new Browser()
  const viaGoogle = await googleSignIn(afterLink, takeover)
  record(group, '…and Google then signs in to that same user', toAccount(viaGoogle) && (await afterLink.me()).id === verifiedId, landed(viaGoogle))

  // Explicit link, but Google has not verified the address it claims.
  const unverifiedLinkerEmail = unique('link-unverified')
  await passwordAccount(unverifiedLinkerEmail, true)
  const linkerBrowser = await passwordSignIn(unverifiedLinkerEmail)
  const unverifiedLink = google(unverifiedLinkerEmail, false)
  const unverifiedLanding = await land(linkerBrowser, await consent(await startGoogle(linkerBrowser, 'link'), unverifiedLink))
  record(group, 'explicit link refuses a Google account whose address is unverified', unverifiedLanding.error === 'google_email_unverified' && (await googleOwner(unverifiedLink.sub)) === null, landed(unverifiedLanding))

  // Explicit link with a Google account for a different address.
  const otherEmail = unique('link-other-owner')
  const otherId = await passwordAccount(otherEmail, true)
  const otherOwner = await passwordSignIn(otherEmail)
  const mismatch = google(unique('someone-else'))
  const mismatched = await land(otherOwner, await consent(await startGoogle(otherOwner, 'link'), mismatch))
  record(group, "explicit link refuses a Google account with a different address", mismatched.error === "email_doesn't_match" && (await googleOwner(mismatch.sub)) === null && !(await providers(otherId)).includes('google'), landed(mismatched))
}

// -------------------------------------------------------------- google first

async function googleFirst(): Promise<void> {
  const group = 'google first'

  const email = unique('google-first')
  const identity = google(email)
  const browser = new Browser()
  const signUp = await googleSignIn(browser, identity)
  const userId = (await browser.me()).id
  record(group, 'Google first creates the account', toAccount(signUp) && Boolean(userId), landed(signUp))

  const since = new Date().toISOString()
  const request = await new Browser().post('/request-password-reset', { email, redirectTo: `${origin}/reset-password` })
  const mail = await mailFor(email, /reset/i, since)
  const link = mail?.links.find((entry) => entry.includes('/reset-password/'))
  record(group, 'a password reset for it mails a link to that address', request.status === 200 && Boolean(link), `HTTP ${request.status}, mail ${mail ? 'arrived' : 'missing'}`)
  if (link) {
    const token = new URL(link).pathname.split('/').pop()!
    const reset = await new Browser().post('/reset-password', { token, newPassword: PASSWORD })
    record(group, 'the reset sets a password', reset.status === 200, `HTTP ${reset.status} ${reset.text.slice(0, 120)}`)
    const byPassword = await passwordSignIn(email)
    record(group, '…which signs in to the same user, not a new one', (await byPassword.me()).id === userId && (await userRows(email)).length === 1)
    record(group, '…and the Google session from before the reset is signed out', (await browser.freshSession()) === null)
    const again = new Browser()
    const googleAgain = await googleSignIn(again, identity)
    record(group, '…while Google still reaches the same user', toAccount(googleAgain) && (await again.me()).id === userId, landed(googleAgain))
    const replayed = await new Browser().post('/reset-password', { token, newPassword: 'Oauth-Replay-2026!' })
    record(group, 'the reset link works once', replayed.status >= 400 && replayed.status < 500, `HTTP ${replayed.status}`)
  }

  // An unverified Google address is somebody claiming an inbox they have not
  // proven. Whatever it does, it must never end up sharing an account with the
  // inbox's real owner.
  const claimed = unique('unverified-google')
  const claimer = google(claimed, false)
  const claimerBrowser = new Browser()
  const claim = await googleSignIn(claimerBrowser, claimer)
  const claimedUser = (await claimerBrowser.me()).id
  record(group, 'an unverified Google address cannot sign up (google_email_unverified)', refusedWith(claim, 'google_email_unverified') && (await userRows(claimed)).length === 0, landed(claim))
  const ownerSince = new Date().toISOString()
  await new Browser().post('/request-password-reset', { email: claimed, redirectTo: `${origin}/reset-password` })
  const ownerMail = await mailFor(claimed, /reset/i, ownerSince)
  const ownerLink = ownerMail?.links.find((entry) => entry.includes('/reset-password/'))
  let ownerUser: string | null = null
  if (ownerLink) {
    await new Browser().post('/reset-password', { token: new URL(ownerLink).pathname.split('/').pop()!, newPassword: PASSWORD })
    ownerUser = (await (await passwordSignIn(claimed)).me()).id
  }
  const claimerAgain = new Browser()
  await googleSignIn(claimerAgain, claimer)
  const claimerUser = (await claimerAgain.me()).id
  record(
    group,
    "an unverified Google address never shares an account with the inbox's owner after a reset",
    !(claimerUser && ownerUser && claimerUser === ownerUser),
    `claimer ${claimedUser ?? 'none'} → ${claimerUser ?? 'none'}, inbox owner ${ownerUser ?? 'none'}`,
  )
}

// ---------------------------------------------------------------- same email

async function sameEmail(): Promise<void> {
  const group = 'same email'

  const email = unique('two-googles')
  const first = google(email)
  const firstBrowser = new Browser()
  await googleSignIn(firstBrowser, first)
  const owner = (await firstBrowser.me()).id
  const second = await googleSignIn(new Browser(), google(email))
  record(group, 'a second Google account claiming the same address is not linked', refusedWith(second, 'account_not_linked'), landed(second))
  record(group, '…the address still has one account with one Google identity', (await userRows(email)).length === 1 && (await providers(owner!)).filter((id) => id === 'google').length === 1)

  const secondUnverified = await googleSignIn(new Browser(), google(email, false))
  record(group, 'nor is one whose address is unverified', refusedWith(secondUnverified, 'google_email_unverified'), landed(secondUnverified))

  // Same Google account (same sub) whose address later becomes another visitor's.
  const victimEmail = unique('victim')
  const victimId = await passwordAccount(victimEmail, true)
  const drifter = google(unique('drifter'))
  await googleSignIn(new Browser(), drifter)
  const drifted = new Browser()
  const drift = await googleSignIn(drifted, { ...drifter, email: victimEmail })
  record(
    group,
    "a Google account whose address changes to another visitor's never reaches that visitor",
    (await drifted.me()).id !== victimId && !(await providers(victimId)).includes('google'),
    landed(drift),
  )
}

// --------------------------------------------------------------------- state

async function state(): Promise<void> {
  const group = 'state'

  // Replay: a callback that already signed someone in, visited again.
  const identity = google(unique('replay'))
  const browser = new Browser()
  const callback = await consent(await startGoogle(browser), identity)
  const first = await land(browser, callback)
  record(group, 'baseline: the callback signs in once', toAccount(first), landed(first))
  const replay = await land(browser, callback)
  record(group, 'the same callback replayed in the same browser signs nobody in', notSignedIn(replay), landed(replay))
  const replayElsewhere = await land(new Browser(), callback)
  record(group, '…nor in a fresh browser', notSignedIn(replayElsewhere), landed(replayElsewhere))

  // Login CSRF: the attacker's callback carried to the victim's browser.
  const attacker = new Browser()
  const attackerIdentity = google(unique('csrf-attacker'))
  const planted = await consent(await startGoogle(attacker), attackerIdentity)
  const victim = new Browser()
  const csrf = await land(victim, planted)
  record(group, "the attacker's callback in a victim browser with no flow: not signed in as the attacker", notSignedIn(csrf) && (await victim.me()).email === null, landed(csrf))
  const busyVictim = new Browser()
  await startGoogle(busyVictim)
  const csrfMidFlow = await land(busyVictim, planted)
  record(group, "…nor in a victim browser mid-way through its own flow (state_mismatch)", notSignedIn(csrfMidFlow) && csrfMidFlow.error === 'state_mismatch', landed(csrfMidFlow))
  const swapped = await land(attacker, planted)
  info(group, `the attacker's own browser can still finish its flow afterwards: ${landed(swapped)}`)

  // Tampered state and code.
  const tamperer = new Browser()
  const good = new URL(await consent(await startGoogle(tamperer), google(unique('tamper'))))
  const badState = new URL(good)
  badState.searchParams.set('state', `${good.searchParams.get('state')!.slice(0, -2)}xx`)
  const stateTampered = await land(tamperer, badState.toString())
  record(group, 'a tampered state signs nobody in', notSignedIn(stateTampered), landed(stateTampered))
  const noState = new URL(good)
  noState.searchParams.delete('state')
  const stateMissing = await land(tamperer, noState.toString())
  record(group, 'a missing state signs nobody in', notSignedIn(stateMissing), landed(stateMissing))

  const codeTamperer = new Browser()
  const genuine = new URL(await consent(await startGoogle(codeTamperer), google(unique('code'))))
  const refusedBefore = await fakeStats()
  const badCode = new URL(genuine)
  badCode.searchParams.set('code', `${genuine.searchParams.get('code')!}x`)
  const codeTampered = await land(codeTamperer, badCode.toString())
  const refusedAfter = await fakeStats()
  record(
    group,
    'a tampered code: invalid_code, and Google refused the exchange',
    refusedWith(codeTampered, 'invalid_code') && (refusedAfter.refused['unknown code'] ?? 0) > (refusedBefore.refused['unknown code'] ?? 0),
    landed(codeTampered),
  )

  // Code injection: a code minted for one flow, redeemed with another flow's state.
  const injector = new Browser()
  const flowA = new URL(await consent(await startGoogle(injector), google(unique('pkce-a'))))
  const flowB = new URL(await consent(await startGoogle(injector), google(unique('pkce-b'))))
  const mixed = new URL(flowB)
  mixed.searchParams.set('code', flowA.searchParams.get('code')!)
  const pkceBefore = await fakeStats()
  const injected = await land(injector, mixed.toString())
  const pkceAfter = await fakeStats()
  record(
    group,
    "one flow's code with another flow's state: refused by PKCE",
    refusedWith(injected, 'invalid_code') && (pkceAfter.refused['PKCE verifier mismatch'] ?? 0) > (pkceBefore.refused['PKCE verifier mismatch'] ?? 0),
    landed(injected),
  )

  // Where the flow may send the reader.
  const openRedirect = await new Browser().post('/sign-in/social', { provider: 'google', callbackURL: 'https://evil.example/landing' })
  record(group, 'a callbackURL off the site is refused', openRedirect.status === 403 && !openRedirect.json?.url, `HTTP ${openRedirect.status}`)
  const openError = await new Browser().post('/sign-in/social', { provider: 'google', callbackURL: `${origin}/account`, errorCallbackURL: 'https://evil.example/oops' })
  record(group, 'an errorCallbackURL off the site is refused', openError.status === 403 && !openError.json?.url, `HTTP ${openError.status}`)
}

// ------------------------------------------------------------------ id token

async function idToken(): Promise<void> {
  const group = 'id token'
  const mint = async (identity: FakeGoogleIdentity, claims: Record<string, unknown> = {}) =>
    ((await (await fetch(`${FAKE}/__control/id-token`, { method: 'POST', body: JSON.stringify({ identity, claims }) })).json()) as { token: string }).token
  const attempt = async (token: string) => {
    const browser = new Browser()
    const response = await browser.post('/sign-in/social', { provider: 'google', idToken: { token } })
    return { status: response.status, signedIn: browser.jar.has(TOKEN), text: response.text }
  }
  const shown = (result: Awaited<ReturnType<typeof attempt>>) => `HTTP ${result.status}${result.signedIn ? ', signed in' : ''} ${result.text.slice(0, 100)}`

  // A token exactly like the ones the code flow stores in visitor_auth_accounts.
  const genuine = await attempt(await mint(google(unique('id-token'))))
  record(group, 'the id-token sign-in path is closed: a genuine Google id_token is not a login', !genuine.signedIn && genuine.status >= 400 && genuine.status < 500, shown(genuine))

  const stored = await pool.query(
    `SELECT a."idToken" FROM visitor_auth_accounts a WHERE a."providerId" = 'google' AND a."idToken" IS NOT NULL ORDER BY a."createdAt" DESC LIMIT 1`,
  )
  const leaked = stored.rows[0]?.idToken as string | undefined
  if (leaked) {
    const replay = await attempt(leaked)
    record(group, 'an id_token read out of visitor_auth_accounts does not sign in', !replay.signedIn, shown(replay))
  } else {
    record(group, 'an id_token read out of visitor_auth_accounts does not sign in', false, 'no stored id_token to try')
  }

  const now = Math.floor(Date.now() / 1000)
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const certs = (await (await fetch(`${FAKE}/google/certs`)).json()) as { keys: Array<{ kid: string }> }
  const forgeries: Array<[string, string]> = [
    ['signed with a key Google never published', signJwt({ iss: FAKE_GOOGLE.issuer, aud: FAKE_GOOGLE.clientId, sub: googleSub(), email: unique('forged'), email_verified: true, iat: now, exp: now + 600 }, privateKey, { alg: 'RS256', kid: certs.keys[0]!.kid })],
    ['for another client', await mint(google(unique('aud')), { aud: 'someone-else.apps.googleusercontent.com' })],
    ['from another issuer', await mint(google(unique('iss')), { iss: 'https://evil.example' })],
    ['expired', await mint(google(unique('exp')), { iat: now - 7200, exp: now - 3600 })],
  ]
  for (const [label, token] of forgeries) {
    const result = await attempt(token)
    record(group, `an id_token ${label} is refused`, !result.signedIn && result.status >= 400 && result.status < 500, shown(result))
  }
  const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ iss: FAKE_GOOGLE.issuer, aud: FAKE_GOOGLE.clientId, sub: googleSub(), email: unique('none'), email_verified: true, iat: now, exp: now + 600 })).toString('base64url')}.`
  const none = await attempt(unsigned)
  record(group, 'an unsigned (alg none) id_token is refused', !none.signedIn && none.status >= 400 && none.status < 500, shown(none))
}

// --------------------------------------------------------------------- staff

async function staff(): Promise<void> {
  const group = 'staff'
  const staffA = await staffLogin()
  const staffHeaders = (extra: Record<string, string> = {}) => ({ origin, 'cf-connecting-ip': caller(), ...extra })
  const payloadMe = async (headers: Record<string, string>) =>
    ((await (await fetch(`${BACKEND}/api/users/me`, { headers: staffHeaders(headers) })).json()) as { user?: { email?: string } | null }).user?.email ?? null

  record(group, 'baseline: the staff cookie is staff to Payload', (await payloadMe({ cookie: staffA.cookie })) === STAFF_EMAIL)

  // A visitor, and a paying one at that.
  const member = await passwordSignIn('member-a@example.com', SYNTHETIC_PASSWORD)
  record(group, 'baseline: member-a is a signed-in member', (await member.me()).member)
  const memberBody = await member.request(MEMBER_ARTICLE)
  record(group, 'baseline: member-a reads the member body', memberBody.status === 200, `HTTP ${memberBody.status}`)
  const visitorToken = decodeURIComponent(member.jar.get(TOKEN)!)

  record(group, 'a visitor cookie is nobody to Payload (/api/users/me)', (await payloadMe({ cookie: member.cookie() })) === null)
  record(group, 'a visitor session token as a Bearer header is nobody to Payload', (await payloadMe({ authorization: `Bearer ${visitorToken.split('.')[0]}` })) === null)
  record(group, 'a visitor session token dressed as payload-token is nobody to Payload', (await payloadMe({ cookie: `payload-token=${visitorToken}` })) === null)

  // Payload honours its cookie on a navigation (`Sec-Fetch-Site: none`), so
  // that is how the admin page is asked for; the staff cookie is the control.
  const adminPage = async (cookie: string) => {
    const response = await fetch(`${BACKEND}/admin`, { headers: { cookie, 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'cf-connecting-ip': caller() }, redirect: 'manual' })
    const html = await response.text()
    const location = response.headers.get('location') ?? /NEXT_REDIRECT;[a-z]+;([^;]+);/.exec(html)?.[1] ?? null
    return { status: response.status, toLogin: Boolean(location?.startsWith('/admin/login')), location }
  }
  const staffAdmin = await adminPage(staffA.cookie)
  record(group, 'baseline: the staff cookie opens /admin', staffAdmin.status === 200 && !staffAdmin.toLogin, JSON.stringify(staffAdmin))
  const visitorAdmin = await adminPage(member.cookie())
  record(group, 'a visitor cookie does not open /admin (sent to the staff login)', visitorAdmin.toLogin, JSON.stringify(visitorAdmin))

  const staffApis: Array<[string, string, unknown?]> = [
    ['GET', '/api/users'],
    ['GET', '/api/visitor-profiles'],
    ['GET', '/api/email-logs'],
    ['GET', '/api/service-accounts'],
    ['POST', '/api/articles', { title: 'visitor wrote this' }],
  ]
  for (const [method, path, body] of staffApis) {
    const asVisitor = await fetch(`${BACKEND}${path}`, {
      method,
      headers: staffHeaders({ cookie: member.cookie(), 'content-type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    record(group, `a visitor cookie is refused by ${method} ${path}`, asVisitor.status === 403 || asVisitor.status === 401, `HTTP ${asVisitor.status}`)
  }
  const control = await fetch(`${BACKEND}/api/users?limit=1`, { headers: staffHeaders({ authorization: `JWT ${staffA.token}` }) })
  record(group, 'baseline: the same staff API answers staff', control.status === 200, `HTTP ${control.status}`)

  // A staff cookie is never a visitor, let alone a member.
  for (const [label, headers] of [
    ['cookie', { cookie: staffA.cookie }],
    ['JWT header', { authorization: `JWT ${staffA.token}` }],
    ['token dressed as the visitor session cookie', { cookie: `${TOKEN}=${encodeURIComponent(staffA.token)}` }],
  ] as Array<[string, Record<string, string>]>) {
    const me = (await (await fetch(`${BACKEND}/api/me`, { headers: staffHeaders(headers) })).json()) as { authenticated?: boolean }
    const details = await fetch(`${BACKEND}/api/payments/subscription-details`, { headers: staffHeaders(headers) })
    const body = await fetch(MEMBER_ARTICLE, { headers: staffHeaders(headers) })
    const methods = await fetch(`${BACKEND}/api/account/auth-methods`, { headers: staffHeaders(headers) })
    const checkout = await fetch(`${BACKEND}/api/payments/create-checkout-session`, {
      method: 'POST',
      headers: staffHeaders({ ...headers, 'content-type': 'application/json' }),
      body: JSON.stringify({ plan: 'monthly' }),
    })
    record(
      group,
      `a staff ${label} is not a visitor or a member (/api/me, subscription, member body, account, checkout)`,
      me.authenticated === false && details.status === 401 && body.status === 401 && methods.status === 401 && checkout.status === 401,
      `me ${me.authenticated}, subscription ${details.status}, body ${body.status}, account ${methods.status}, checkout ${checkout.status}`,
    )
  }

  // Signing out of one leaves the other.
  const both = await passwordSignIn('member-a@example.com', SYNTHETIC_PASSWORD)
  const staffB = await staffLogin()
  both.jar.set('payload-token', staffB.cookie.slice('payload-token='.length))
  await both.post('/sign-out', {})
  record(group, 'visitor sign-out leaves the staff session', (await payloadMe({ cookie: `payload-token=${both.jar.get('payload-token') ?? ''}` })) === STAFF_EMAIL && (await both.freshSession()) === null)

  // The same staff session, now beside a fresh visitor one, signs out instead.
  const both2 = await passwordSignIn('member-a@example.com', SYNTHETIC_PASSWORD)
  const staffC = staffB
  both2.jar.set('payload-token', staffC.cookie.slice('payload-token='.length))
  const logout = await both2.request(`${BACKEND}/api/users/logout`, { method: 'POST', body: {} })
  const staffGone = (await payloadMe({ cookie: staffC.cookie })) === null
  const visitorStays = (await both2.freshSession())?.email === 'member-a@example.com'
  record(group, 'staff logout leaves the visitor session', logout.status === 200 && visitorStays, `logout HTTP ${logout.status}, visitor ${visitorStays ? 'kept' : 'lost'}`)
  info(group, `the logged-out staff cookie replayed: ${staffGone ? 'refused' : 'still staff (JWT until expiry)'}`)

  // One address never holds both.
  const staffSignUp = await new Browser().post('/sign-up/email', { email: STAFF_EMAIL, password: PASSWORD, name: 'Staff Visitor' })
  record(group, 'visitor sign-up with a staff address is refused', staffSignUp.status === 403 && (await userRows(STAFF_EMAIL)).length === 0, `HTTP ${staffSignUp.status}`)
  const staffPassword = await passwordSignIn(STAFF_EMAIL, SYNTHETIC_PASSWORD)
  record(group, "the staff password is not a visitor login", (await staffPassword.me()).email === null)
  for (const [label, email] of [
    ['a staff address', STAFF_EMAIL],
    ['an @questurian.com address', `oauth-${run}@questurian.com`],
  ]) {
    const viaGoogle = await googleSignIn(new Browser(), google(email!))
    record(group, `Google with ${label} is refused (admin_oauth_disabled)`, refusedWith(viaGoogle, 'admin_oauth_disabled') && (await userRows(email!)).length === 0, landed(viaGoogle))
  }

  // Staff addresses are @questurian.com (the Users email rule), apart from the
  // bootstrap admin, which the guards above find by looking the address up.
  // Underneath both apps, `identity_email_owners` holds one owner per
  // address; a row written past both apps' guards must still be refused.
  const planted = async (email: string) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`INSERT INTO visitor_auth_users (id, name, email, "emailVerified") VALUES ($1, 'Planted Visitor', $2, true)`, [`oauth-planted-${run}-${(serial += 1)}`, email])
      return 'accepted'
    } catch (error) {
      return (error as { code?: string; constraint?: string }).constraint ?? (error as { code?: string }).code ?? 'refused'
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  }
  const atStaff = await planted(STAFF_EMAIL)
  record(group, "the database refuses a visitor row at a staff member's address", atStaff !== 'accepted', atStaff)
  const atDomain = await planted(`oauth-planted-${run}@questurian.com`)
  record(group, 'the database refuses a visitor row at an @questurian.com address', atDomain !== 'accepted', atDomain)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(2)
})
