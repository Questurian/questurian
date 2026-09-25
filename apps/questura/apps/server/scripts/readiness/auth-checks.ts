/**
 * Sign-in and sessions, attacked, against the production build's real Better
 * Auth (launch harness B2, B3, B5).
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:auth
 *
 * Each run signs up its own throwaway account in the sandbox, so changing its
 * password cannot disturb the shared synthetic readers.
 *
 *  - **B2 tampering.** Flipped bytes, A's cache cookie with B's token and the
 *    reverse, a token signed with the wrong secret, a token planted before
 *    sign-in (fixation), oversized and duplicated cookie headers, and old
 *    cookies replayed after sign-out: never someone else, never a 500,
 *    payments and the member body refuse a revoked session at once, and
 *    `/api/me` within seconds despite the cache cookie.
 *  - **B3 enumeration and limits.** A wrong password and an unknown email get
 *    the same status and body; password reset answers the same for unknown
 *    addresses; sign-in over its limit answers 429 with `Retry-After`.
 *  - **B5 password rules**, on the server, on every path that sets one.
 */

import { createHmac, randomBytes } from 'node:crypto'

import { SYNTHETIC_PASSWORD } from './launch-corpus'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { freshRateLimits, readStackState, STACK_PORTS } from './stack'

const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`
const AUTH = `${BACKEND}/api/visitor-auth`
const TOKEN = '__Secure-questura_visitor.session_token'
const DATA = '__Secure-questura_visitor.session_data'

type Check = { group: string; name: string; ok: boolean; detail: string }
const checks: Check[] = []
function record(group: string, name: string, ok: boolean, detail = ''): void {
  checks.push({ group, name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} [${group}] ${name}${ok ? '' : ` — ${detail}`}`)
}

let address = 0
const caller = () => {
  address += 1
  return `198.20.${Math.floor(address / 250)}.${(address % 250) + 1}`
}

type Jar = Record<string, string>

function cookies(setCookie: string[]): Jar {
  const jar: Jar = {}
  for (const header of setCookie) {
    const [pair] = header.split(';')
    const at = pair!.indexOf('=')
    jar[pair!.slice(0, at).trim()] = pair!.slice(at + 1).trim()
  }
  return jar
}
const header = (jar: Jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

let origin = ''

async function post(path: string, body: unknown, options: { cookie?: string; ip?: string } = {}) {
  const response = await fetch(`${AUTH}${path}`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'cf-connecting-ip': options.ip ?? caller(),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
  const text = await response.text()
  return { status: response.status, text, jar: cookies(response.headers.getSetCookie()), headers: response.headers }
}

async function whoIs(cookie: string): Promise<{ status: number; email: string | null }> {
  const response = await fetch(`${BACKEND}/api/me`, { headers: { origin, cookie, 'cf-connecting-ip': caller() } })
  const body = (await response.json().catch(() => null)) as { authenticated?: boolean; principal?: { email?: string } } | null
  return { status: response.status, email: body?.authenticated ? (body.principal?.email ?? '?') : null }
}

async function signInAs(email: string, password = SYNTHETIC_PASSWORD): Promise<Jar> {
  const response = await post('/sign-in/email', { email, password })
  if (response.status !== 200 || !response.jar[TOKEN]) throw new Error(`sign-in ${email} answered ${response.status}`)
  return response.jar
}

/**
 * Changes one character near the end of the signature. Not the last base64
 * character: that one also carries padding bits, and swapping A for B there
 * (or B, C or D for A) changed only those bits, so the signature still
 * decoded to the same bytes and verified. About one run in sixteen "failed"
 * that way (seen on the safety net, PR #715). Five from the end is always a
 * whole-bit character.
 */
function flipLastChar(value: string): string {
  const decoded = decodeURIComponent(value)
  const at = decoded.length - 5
  const swapped = decoded[at] === 'A' ? 'B' : 'A'
  return encodeURIComponent(`${decoded.slice(0, at)}${swapped}${decoded.slice(at + 1)}`)
}

async function main(): Promise<void> {
  assertPreflight(sandboxSettings())
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  // Scripts run back to back share the per-address budgets; start from zero.
  await freshRateLimits()
  origin = stack.origins.client

  const probeEmail = `auth-probe-${Date.now()}@example.test`
  const strong = 'Probe-Password-2026!'
  const signUp = await post('/sign-up/email', { email: probeEmail, password: strong, name: 'Auth Probe' })
  if (signUp.status !== 200) throw new Error(`probe sign-up answered ${signUp.status}: ${signUp.text.slice(0, 200)}`)

  // ------------------------------------------------------------------ B2
  const b2 = 'tampering'
  const a = await signInAs('member-a@example.com')
  const b = await signInAs('member-b@example.com')

  record(b2, 'A is A', (await whoIs(header(a))).email === 'member-a@example.com')

  const flippedToken = await whoIs(`${TOKEN}=${flipLastChar(a[TOKEN]!)}`)
  record(b2, 'a flipped byte in the session token signs out, not 500', flippedToken.status === 200 && flippedToken.email === null, JSON.stringify(flippedToken))

  if (a[DATA]) {
    const flippedData = await whoIs(`${TOKEN}=${a[TOKEN]}; ${DATA}=${flipLastChar(a[DATA]!)}`)
    record(b2, 'a flipped byte in the cache cookie falls back to the token (still A, never someone else)', flippedData.email === 'member-a@example.com' || flippedData.email === null, JSON.stringify(flippedData))

    const aDataBToken = await whoIs(`${TOKEN}=${b[TOKEN]}; ${DATA}=${a[DATA]}`)
    record(b2, "A's cache cookie with B's token is never A", aDataBToken.email !== 'member-a@example.com', JSON.stringify(aDataBToken))
    const bDataAToken = await whoIs(`${TOKEN}=${a[TOKEN]}; ${DATA}=${b[DATA]}`)
    record(b2, "B's cache cookie with A's token is never B", bDataAToken.email !== 'member-b@example.com', JSON.stringify(bDataAToken))
  } else {
    record(b2, 'the cookie cache is issued at sign-in', false, 'no session_data cookie')
  }

  const [rawToken] = decodeURIComponent(a[TOKEN]!).split('.')
  const wrongSecret = createHmac('sha256', 'not-the-sandbox-secret').update(rawToken!).digest('base64')
  const forged = await whoIs(`${TOKEN}=${encodeURIComponent(`${rawToken}.${wrongSecret}`)}`)
  record(b2, 'a token signed with the wrong secret signs out, not 500', forged.status === 200 && forged.email === null, JSON.stringify(forged))

  const unsigned = await whoIs(`${TOKEN}=${rawToken}`)
  record(b2, 'a bare token without its signature signs out', unsigned.status === 200 && unsigned.email === null, JSON.stringify(unsigned))

  const planted = `${TOKEN}=${encodeURIComponent(`planted${randomBytes(12).toString('hex')}.x`)}`
  const fixation = await post('/sign-in/email', { email: probeEmail, password: strong }, { cookie: planted })
  record(b2, 'a token planted before sign-in is replaced, not adopted', Boolean(fixation.jar[TOKEN]) && !planted.includes(fixation.jar[TOKEN]!), `status ${fixation.status}`)

  const huge = await fetch(`${BACKEND}/api/me`, { headers: { origin, cookie: `${header(a)}; pad=${'x'.repeat(30_000)}`, 'cf-connecting-ip': caller() } })
  record(b2, 'a 30 KB cookie header is refused or ignored, not 500', huge.status < 500, `HTTP ${huge.status}`)

  const doubled = await whoIs(`${TOKEN}=${b[TOKEN]}; ${TOKEN}=${a[TOKEN]}`)
  record(b2, 'two session tokens in one header resolve to one of them, not a blend', ['member-a@example.com', 'member-b@example.com', null].includes(doubled.email), JSON.stringify(doubled))

  // Sign out B, then replay B's old cookies.
  const signedOut = await post('/sign-out', {}, { cookie: header(b) })
  record(b2, 'sign-out answers 200', signedOut.status === 200, `HTTP ${signedOut.status}`)
  // The replayed cookies still carry the five-minute cache copy. Sign-out is
  // recorded as a revocation (`session-revocations.ts`), so `/api/me` stops
  // trusting that copy within about a second.
  const replayStarted = performance.now()
  let replay = await whoIs(header(b))
  while (replay.email !== null && performance.now() - replayStarted < 5_000) {
    await new Promise((done) => setTimeout(done, 200))
    replay = await whoIs(header(b))
  }
  const replayMs = Math.round(performance.now() - replayStarted)
  record(b2, '/api/me refuses a signed-out session\'s replayed cookies within 3 s', replay.email === null && replayMs <= 3_000, `${replay.email ?? 'signed out'} after ${replayMs} ms`)
  const details = await fetch(`${BACKEND}/api/payments/subscription-details`, { headers: { origin, cookie: header(b), 'cf-connecting-ip': caller() } })
  record(b2, 'payments refuse the replayed cookies at once', details.status === 401, `HTTP ${details.status}`)
  const bodyReplay = await fetch(`${BACKEND}/api/public/articles/full?type=articles&id=1&lang=en`, { headers: { origin, cookie: header(b), 'cf-connecting-ip': caller() } })
  record(b2, 'the member body refuses the replayed cookies at once', bodyReplay.status === 401, `HTTP ${bodyReplay.status}`)

  // ------------------------------------------------------------------ B3
  const b3 = 'enumeration'
  const wrongPassword = await post('/sign-in/email', { email: 'member-a@example.com', password: 'Wrong-Password-2026!' })
  const unknownEmail = await post('/sign-in/email', { email: `nobody-${Date.now()}@example.test`, password: 'Wrong-Password-2026!' })
  record(b3, 'wrong password and unknown email get the same status', wrongPassword.status === unknownEmail.status, `${wrongPassword.status} vs ${unknownEmail.status}`)
  record(b3, 'and the same body', wrongPassword.text === unknownEmail.text, `${wrongPassword.text.slice(0, 120)} | ${unknownEmail.text.slice(0, 120)}`)

  const time = async (email: string) => {
    const started = performance.now()
    await post('/sign-in/email', { email, password: 'Wrong-Password-2026!' })
    return performance.now() - started
  }
  const known: number[] = []
  const unknown: number[] = []
  for (let i = 0; i < 6; i += 1) {
    known.push(await time('nonmember@example.com'))
    unknown.push(await time(`nobody-${i}-${Date.now()}@example.test`))
  }
  const median = (values: number[]) => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)]!
  const gap = Math.abs(median(known) - median(unknown))
  record(b3, 'wrong password and unknown email take about the same time (median gap under 60 ms)', gap < 60, `known ${median(known).toFixed(0)} ms, unknown ${median(unknown).toFixed(0)} ms`)

  const resetKnown = await post('/request-password-reset', { email: 'nonmember@example.com', redirectTo: `${origin}/reset-password` })
  const resetUnknown = await post('/request-password-reset', { email: `nobody-reset-${Date.now()}@example.test`, redirectTo: `${origin}/reset-password` })
  record(b3, 'password reset answers the same for an unknown address', resetKnown.status === resetUnknown.status && resetKnown.text === resetUnknown.text, `${resetKnown.status} ${resetKnown.text.slice(0, 80)} | ${resetUnknown.status} ${resetUnknown.text.slice(0, 80)}`)

  const oneCaller = caller()
  let limited: Awaited<ReturnType<typeof post>> | null = null
  for (let i = 0; i < 12; i += 1) {
    const attempt = await post('/sign-in/email', { email: 'member-a@example.com', password: 'Wrong-Password-2026!' }, { ip: oneCaller })
    if (attempt.status === 429) {
      limited = attempt
      break
    }
  }
  record(b3, 'sign-in over its limit answers 429', limited?.status === 429, `last ${limited?.status}`)
  record(b3, '…with Retry-After', Number(limited?.headers.get('retry-after') ?? 0) > 0, `Retry-After=${limited?.headers.get('retry-after')}`)

  // ------------------------------------------------------------------ B5
  const b5 = 'password rules'
  const weak: Array<[string, string]> = [
    ['7 characters', 'Ab1!xyz'],
    ['129 characters', `Ab1!${'x'.repeat(125)}`],
    ['no number', 'Abcdefgh!'],
    ['no upper case', 'abcdefg1!'],
    ['no symbol', 'Abcdefg12'],
    ['a NUL byte', 'Abc1!def\u0000'],
  ]
  for (const [label, password] of weak) {
    const attempt = await post('/sign-up/email', { email: `weak-${Date.now()}-${address}@example.test`, password, name: 'Weak' })
    record(b5, `sign-up refuses ${label}`, attempt.status >= 400 && attempt.status < 500 && !attempt.jar[TOKEN], `HTTP ${attempt.status}`)
  }

  const unicode = await post('/sign-up/email', { email: `unicode-${Date.now()}@example.test`, password: 'Ünïcødé-🔑-2026!', name: 'Unicode' })
  record(b5, 'sign-up accepts a strong password with unicode and emoji', unicode.status === 200, `HTTP ${unicode.status} ${unicode.text.slice(0, 120)}`)
  if (unicode.status === 200) {
    const back = await post('/sign-in/email', { email: JSON.parse(unicode.text).user?.email ?? '', password: 'Ünïcødé-🔑-2026!' })
    record(b5, '…and signs in with it again', back.status === 200, `HTTP ${back.status}`)
  }

  const probe = await signInAs(probeEmail, strong)
  const changeWeak = await post('/change-password', { currentPassword: strong, newPassword: 'short1!' }, { cookie: header(probe) })
  record(b5, 'change-password refuses a weak new password', changeWeak.status >= 400 && changeWeak.status < 500, `HTTP ${changeWeak.status}`)

  // The guard used to check `password ?? newPassword`; reset, change and set
  // use `newPassword`, so a strong decoy in `password` hid a weak real one.
  const decoy = await post('/change-password', { currentPassword: strong, newPassword: 'weakpass', password: 'Decoy-Strong-2026!' }, { cookie: header(probe) })
  record(b5, 'a strong decoy `password` does not wave a weak `newPassword` through', decoy.status >= 400 && decoy.status < 500, `HTTP ${decoy.status}`)
  if (decoy.status === 200) {
    // Put it back so the probe account is not left with a weak password.
    await post('/change-password', { currentPassword: 'weakpass', newPassword: strong }, { cookie: header(probe) })
  }

  const failed = checks.filter((check) => !check.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} auth checks passed.`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(2)
})
