/**
 * Real routes, real credentials, exact answers (surge plan L01, L02, L03).
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:routes
 *
 * Runs against the stack `stack.ts` started — production builds, the launch
 * corpus, real sign-ins — and checks what unit tests cannot: that Payload's
 * own strategies, Better Auth's own cookies and the real route wiring
 * produce the behaviour the unit tests assume.
 *
 *  - **Identity matrix.** Anonymous, member A, member B, a signed-in
 *    non-member, an expired session, a random and a malformed cookie, each
 *    against `/api/me` by exact principal (email and auth user id), not by a
 *    boolean. No-cookie identity must cost zero SQL statements.
 *  - **Isolation.** A's and B's bookmark refs are exactly their own; the
 *    member body is served to a member, refused to a non-member, an expired
 *    session and an anonymous reader, and every public page of a members-only
 *    piece omits its member marker.
 *  - **Credential matrix (L02).** Absent, unrelated cookie, malformed header,
 *    expired JWT, forged JWT, bogus API key, `x-api-key`, valid staff, valid
 *    service account, disabled staff — against a REST collection, a REST
 *    global, a disguised POST read and an alias-heavy GraphQL query. Clamps
 *    are read from Payload's own response (`limit`), and gate counters from
 *    the backend's `/api/internal/db-stats`.
 *
 * Evidence: `docs/capacity/runs/<date>-surge-routes.{json,md}`. No cookie,
 * token or key is ever written; identities are named by label.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Pool } from 'pg'

import { signInAll } from './identities'
import { LAUNCH_MANIFEST_PATH, type LaunchManifest, STAFF_EMAIL, SYNTHETIC_PASSWORD } from './launch-corpus'
import { assertPreflight } from './preflight'
import { sandboxSettings, sourceIdentity } from './sandbox'
import { readStackState, STACK_PORTS } from './stack'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNS = resolve(HERE, '../../../../docs/capacity/runs')
const PAYLOAD_SECRET = 'readiness-payload-secret-not-a-real-one-0123456789abcdef0123'

type Check = { group: string; name: string; ok: boolean; detail: string }
const checks: Check[] = []

function record(group: string, name: string, ok: boolean, detail: string): void {
  checks.push({ group, name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} [${group}] ${name}${ok ? '' : ` — ${detail}`}`)
}

const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`
const CLIENT = `http://127.0.0.1:${STACK_PORTS.client}`

// ---------------------------------------------------------------------------
// Tokens the harness can make because it knows the sandbox's own secret.
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function jwt(payload: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const signature = base64url(createHmac('sha256', secret).update(`${header}.${body}`).digest())
  return `${header}.${body}.${signature}`
}

/** Payload signs with the first 32 hex chars of sha256(PAYLOAD_SECRET). */
const payloadJwtSecret = createHash('sha256').update(PAYLOAD_SECRET).digest('hex').slice(0, 32)

// ---------------------------------------------------------------------------

async function json(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

async function gateStats(secret: string): Promise<Record<string, { admitted: number; refused: Record<string, number> }>> {
  const response = await fetch(`${BACKEND}/api/internal/db-stats`, { headers: { authorization: `Bearer ${secret}` } })
  if (!response.ok) throw new Error(`db-stats answered ${response.status}`)
  return ((await response.json()) as { admission: Record<string, { admitted: number; refused: Record<string, number> }> }).admission
}

function statementsOf(response: Response): number | null {
  const timing = response.headers.get('server-timing') ?? ''
  const match = /desc="(\d+) statements/.exec(timing)
  return match ? Number(match[1]) : null
}

async function main(): Promise<void> {
  const settings = sandboxSettings()
  assertPreflight(settings)
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  const origin = stack.origins.client
  const manifest = JSON.parse(readFileSync(LAUNCH_MANIFEST_PATH, 'utf8')) as LaunchManifest
  const pool = new Pool({ connectionString: settings.databaseUri, max: 2 })

  try {
    const idByEmail = new Map(
      (await pool.query<{ id: string; email: string }>(`SELECT id, email FROM visitor_auth_users`)).rows.map((row) => [
        row.email,
        row.id,
      ]),
    )

    const jar = await signInAll(manifest, {
      backend: BACKEND,
      origin,
      redisUrl: `redis://127.0.0.1:${STACK_PORTS.redis}`,
      databaseUri: settings.databaseUri,
    })
    const cookieFor = (label: string | null) => (label ? jar.get(label) : undefined)
    const privateHeaders = (label: string | null, extra: Record<string, string> = {}) => {
      const headers: Record<string, string> = { origin, ...extra }
      const cookie = cookieFor(label)
      if (cookie) headers.cookie = cookie
      return headers
    }

    // --- Identity matrix ----------------------------------------------------
    const anonymous = await fetch(`${BACKEND}/api/me`, { headers: { origin } })
    const anonymousBody = await json(anonymous)
    record('identity', 'anonymous is anonymous', anonymousBody?.authenticated === false, JSON.stringify(anonymousBody))
    record('identity', 'no-cookie identity runs zero SQL', statementsOf(anonymous) === 0, `statements=${statementsOf(anonymous)}`)
    record('identity', 'identity is never stored', /no-store/.test(anonymous.headers.get('cache-control') ?? ''), anonymous.headers.get('cache-control') ?? '')

    for (const identity of manifest.identities) {
      const response = await fetch(`${BACKEND}/api/me`, { headers: privateHeaders(identity.label) })
      const body = (await json(response)) as { authenticated?: boolean; principal?: { id?: string; email?: string; membership?: { active?: boolean } } } | null
      const expectedId = idByEmail.get(identity.email)
      const ok = identity.expect.authenticated
        ? body?.authenticated === true &&
          body.principal?.email === identity.email &&
          body.principal?.id === expectedId &&
          body.principal?.membership?.active === identity.expect.member
        : body?.authenticated === false && body?.principal === null
      record(
        'identity',
        `${identity.label} → ${identity.expect.authenticated ? (identity.expect.member ? 'member' : 'signed-in non-member') : 'signed out'}`,
        ok && response.status === 200,
        `HTTP ${response.status} ${JSON.stringify({ authenticated: body?.authenticated, email: body?.principal?.email, active: body?.principal?.membership?.active })}`,
      )
    }

    for (const [label, cookie] of [
      ['a random signed-looking token', 'questura_visitor.session_token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'],
      ['a malformed token', 'questura_visitor.session_token=%%%not-a-token'],
    ] as const) {
      const response = await fetch(`${BACKEND}/api/me`, { headers: { origin, cookie } })
      const body = await json(response)
      record('identity', `${label} → signed out`, response.status === 200 && body?.authenticated === false, `HTTP ${response.status}`)
    }

    // --- Bookmark isolation -------------------------------------------------
    const refsOf = async (label: string | null) => {
      const response = await fetch(`${BACKEND}/api/account/bookmarks/refs`, { headers: privateHeaders(label) })
      return { status: response.status, body: (await json(response)) as { authenticated?: boolean; refs?: Array<{ targetType: string; targetId: number }> } | null, cache: response.headers.get('cache-control') ?? '' }
    }
    const key = (ref: { targetType: string; targetId: number }) => `${ref.targetType}:${ref.targetId}`
    for (const identity of manifest.identities.filter((entry) => entry.expect.authenticated)) {
      const refs = await refsOf(identity.label)
      const got = new Set((refs.body?.refs ?? []).map(key))
      const want = new Set(identity.bookmarks.map(key))
      const exact = got.size === want.size && [...want].every((entry) => got.has(entry))
      record('bookmarks', `${identity.label} sees exactly their own refs`, refs.status === 200 && refs.body?.authenticated === true && exact, `got ${[...got].join(',') || 'none'}; want ${[...want].join(',') || 'none'}`)
      record('bookmarks', `${identity.label} refs are no-store`, /no-store/.test(refs.cache), refs.cache)
    }
    for (const label of [null, 'expired']) {
      const refs = await refsOf(label)
      record('bookmarks', `${label ?? 'anonymous'} refs → signed out, nothing listed`, refs.status === 200 && refs.body?.authenticated === false && (refs.body?.refs ?? []).length === 0, JSON.stringify(refs.body))
    }
    const aRefs = new Set(manifest.identities.find((entry) => entry.label === 'member-a')!.bookmarks.map(key))
    const bRefs = new Set(manifest.identities.find((entry) => entry.label === 'member-b')!.bookmarks.map(key))
    record('bookmarks', 'A and B fixtures do not overlap', [...aRefs].every((entry) => !bRefs.has(entry)), '')

    // --- Member body --------------------------------------------------------
    const memberPieces = manifest.pieces.filter((piece) => piece.status === 'published' && piece.access === 'member')
    const freePiece = manifest.pieces.find((piece) => piece.status === 'published' && piece.access === 'free' && piece.type === 'articles')!
    for (const piece of memberPieces.filter((_, index) => index % 4 === 0)) {
      const url = `${BACKEND}/api/public/articles/full?type=${piece.type}&id=${piece.id}&lang=en`
      const cases: Array<[string | null, number, boolean]> = [
        ['member-a', 200, true],
        ['member-b', 200, true],
        ['nonmember', 403, false],
        ['expired', 401, false],
        [null, 401, false],
      ]
      for (const [label, status, sees] of cases) {
        const response = await fetch(url, { headers: privateHeaders(label, { 'cf-connecting-ip': `198.51.100.${cases.findIndex((entry) => entry[0] === label) + 1}` }) })
        const text = await response.text()
        const hasMarker = text.includes(piece.markers.member!)
        record(
          'member-body',
          `${piece.markers.title} for ${label ?? 'anonymous'} → ${status}${sees ? ' with body' : ', no body'}`,
          response.status === status && hasMarker === sees && /no-store/.test(response.headers.get('cache-control') ?? ''),
          `HTTP ${response.status}, member marker ${hasMarker ? 'present' : 'absent'}`,
        )
      }
    }
    {
      const response = await fetch(`${BACKEND}/api/public/articles/full?type=articles&id=${freePiece.id}&lang=en`, { headers: privateHeaders('member-a') })
      record('member-body', 'a free piece is not served by the member route', response.status === 404, `HTTP ${response.status}`)
    }

    // --- Public pages never carry a member marker -------------------------
    for (const piece of memberPieces) {
      const response = await fetch(`${CLIENT}${piece.path}`, { redirect: 'manual' })
      const html = await response.text()
      const ok =
        response.status === 200 &&
        html.includes(piece.markers.title) &&
        html.includes(piece.markers.body) &&
        !html.includes(piece.markers.member!)
      record('public-page', `${piece.markers.title} public page: title+body marker, no member marker`, ok, `HTTP ${response.status}; member marker ${html.includes(piece.markers.member!) ? 'LEAKED' : 'absent'}; body marker ${html.includes(piece.markers.body) ? 'present' : 'absent'}`)
    }

    // --- Credential matrix (L02) --------------------------------------------
    const staffLogin = await fetch(`${BACKEND}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: STAFF_EMAIL, password: SYNTHETIC_PASSWORD }),
    })
    const staffToken = ((await json(staffLogin)) as { token?: string } | null)?.token
    record('credentials', 'the synthetic staff account signs in', Boolean(staffToken), `HTTP ${staffLogin.status}`)

    // Since Payload 3.90 an API key is write-only: no response ever carries
    // it back. The caller brings the key, as the admin panel now does (it
    // generates one in the browser and shows it once before saving).
    const serviceKey = randomBytes(32).toString('hex')
    const service = await fetch(`${BACKEND}/api/service-accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `JWT ${staffToken}` },
      body: JSON.stringify({ name: `Readiness probe ${Date.now()}`, enableAPIKey: true, apiKey: serviceKey }),
    })
    // That the key works is what the `valid service account` rows below prove.
    const serviceBody = (await json(service)) as { doc?: { id?: unknown; apiKey?: string } } | null
    record(
      'credentials',
      'an admin can mint a service account key, and the response does not echo it',
      service.status === 201 && serviceBody?.doc?.id !== undefined && !('apiKey' in (serviceBody.doc ?? {})),
      `HTTP ${service.status}, apiKey ${serviceBody?.doc && 'apiKey' in serviceBody.doc ? 'present' : 'absent'}`,
    )

    // A staff account that is disabled after signing in: a valid token for a
    // user who must not count as staff.
    // Staff accounts must be @questurian.com; this one is synthetic and lives
    // only in the disposable database. The sandbox cannot send mail.
    const disabledEmail = `readiness-disabled-${Date.now()}@questurian.com`
    const createDisabled = await fetch(`${BACKEND}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `JWT ${staffToken}` },
      body: JSON.stringify({ email: disabledEmail, password: SYNTHETIC_PASSWORD, role: 'editor', status: 'active' }),
    })
    const disabledId = ((await json(createDisabled)) as { doc?: { id?: number } } | null)?.doc?.id
    const disabledLogin = await fetch(`${BACKEND}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: disabledEmail, password: SYNTHETIC_PASSWORD }),
    })
    const disabledToken = ((await json(disabledLogin)) as { token?: string } | null)?.token
    await fetch(`${BACKEND}/api/users/${disabledId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `JWT ${staffToken}` },
      body: JSON.stringify({ status: 'disabled' }),
    })
    record('credentials', 'a disabled staff token exists to test with', Boolean(disabledToken && disabledId), `create ${createDisabled.status}, login ${disabledLogin.status}`)

    const now = Math.floor(Date.now() / 1000)
    const expiredJwt = jwt({ id: 1, collection: 'users', email: STAFF_EMAIL, iat: now - 7200, exp: now - 3600 }, payloadJwtSecret)
    const forgedJwt = jwt({ id: 1, collection: 'users', email: STAFF_EMAIL, iat: now, exp: now + 3600 }, 'not-the-secret-0123456789abcdef')

    type Credential = { label: string; headers: Record<string, string>; verified: boolean }
    const credentials: Credential[] = [
      { label: 'absent', headers: {}, verified: false },
      { label: 'unrelated cookie', headers: { cookie: 'theme=dark' }, verified: false },
      { label: 'malformed header', headers: { authorization: 'Bearer !!!' }, verified: false },
      { label: 'expired JWT', headers: { authorization: `JWT ${expiredJwt}` }, verified: false },
      { label: 'forged JWT', headers: { authorization: `JWT ${forgedJwt}` }, verified: false },
      { label: 'forged payload-token cookie', headers: { cookie: `payload-token=${forgedJwt}` }, verified: false },
      { label: 'bogus API key', headers: { authorization: 'service-accounts API-Key not-a-real-key-000000' }, verified: false },
      { label: 'x-api-key header', headers: { 'x-api-key': 'anything' }, verified: false },
      { label: 'disabled staff', headers: { authorization: `JWT ${disabledToken}` }, verified: false },
      { label: 'valid staff', headers: { authorization: `JWT ${staffToken}` }, verified: true },
      { label: 'valid service account', headers: { authorization: `service-accounts API-Key ${serviceKey}` }, verified: true },
    ]

    const aliasQuery = `{ ${Array.from({ length: 20 }, (_, index) => `a${index}: Locations(limit: 100) { docs { id } }`).join(' ')} }`

    for (const [index, credential] of credentials.entries()) {
      const client = { 'cf-connecting-ip': `203.0.113.${index + 1}` }
      const before = await gateStats(stack.secrets.dbStats)

      const collection = await fetch(`${BACKEND}/api/locations?limit=1000&depth=10`, { headers: { ...credential.headers, ...client } })
      const collectionBody = (await json(collection)) as { limit?: number; docs?: unknown[] } | null
      const global = await fetch(`${BACKEND}/api/globals/main-homepage?depth=10`, { headers: { ...credential.headers, ...client } })
      const override = await fetch(`${BACKEND}/api/locations`, {
        method: 'POST',
        headers: { ...credential.headers, ...client, 'x-payload-http-method-override': 'GET', 'content-type': 'application/x-www-form-urlencoded' },
        body: 'limit=1000&depth=10',
      })
      const graphql = await fetch(`${BACKEND}/api/graphql`, {
        method: 'POST',
        headers: { ...credential.headers, ...client, 'content-type': 'application/json' },
        body: JSON.stringify({ query: aliasQuery }),
      })

      const after = await gateStats(stack.secrets.dbStats)
      const moved = (gate: string) => (after[gate]?.admitted ?? 0) - (before[gate]?.admitted ?? 0)

      if (credential.verified) {
        record('credentials', `${credential.label}: REST read keeps its own limit (1000)`, collection.status === 200 && collectionBody?.limit === 1000, `HTTP ${collection.status}, limit ${collectionBody?.limit}`)
        record('credentials', `${credential.label}: disguised POST read allowed`, override.status === 200, `HTTP ${override.status}`)
        record('credentials', `${credential.label}: GraphQL reaches Payload`, graphql.status === 200, `HTTP ${graphql.status}`)
        record('credentials', `${credential.label}: runs in the finite staff gate`, moved('staff') >= 3, `staff gate +${moved('staff')}`)
      } else {
        record('credentials', `${credential.label}: REST read clamped to 100`, collection.status === 200 && collectionBody?.limit === 100 && (collectionBody?.docs?.length ?? 0) <= 100, `HTTP ${collection.status}, limit ${collectionBody?.limit}`)
        record('credentials', `${credential.label}: disguised POST read refused`, override.status === 401, `HTTP ${override.status}`)
        record('credentials', `${credential.label}: GraphQL refused before it runs`, graphql.status === 401, `HTTP ${graphql.status}`)
        record('credentials', `${credential.label}: never enters the staff gate`, moved('staff') === 0, `staff gate +${moved('staff')}`)
      }
      record('credentials', `${credential.label}: global answers`, global.status === 200, `HTTP ${global.status}`)
      const presented = Object.keys(credential.headers).some((name) => name === 'authorization') || /payload-token=/.test(credential.headers.cookie ?? '')
      record(
        'credentials',
        `${credential.label}: ${presented ? 'verified in' : 'skips'} the credential gate`,
        presented ? moved('credential') >= 1 : moved('credential') === 0,
        `credential gate +${moved('credential')}`,
      )
    }
  } finally {
    await pool.end()
  }

  const failed = checks.filter((check) => !check.ok)
  const stamp = new Date().toISOString().slice(0, 10)
  const evidence = {
    kind: 'surge-route-checks',
    takenAt: new Date().toISOString(),
    source: sourceIdentity(),
    dataset: { version: 'launch-v1' },
    stack: { ports: STACK_PORTS, builtFrom: readStackState()?.builtFrom ?? null },
    counts: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    checks,
  }
  mkdirSync(RUNS, { recursive: true })
  writeFileSync(resolve(RUNS, `${stamp}-surge-routes.json`), JSON.stringify(evidence, null, 2) + '\n')
  console.log(`\n${checks.length - failed.length}/${checks.length} route checks passed.`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
