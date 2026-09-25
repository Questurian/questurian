/**
 * Moving day, rehearsed (launch fix plan item 5).
 *
 *   docker run -d --rm --name questura-cutover-pg17 -p 127.0.0.1:5463:5432 \
 *     -e POSTGRES_HOST_AUTH_METHOD=trust --tmpfs /var/lib/postgresql/data postgres:17
 *   pnpm readiness:stack -- up
 *   READINESS_CUTOVER_TARGET_URI=postgres://postgres@127.0.0.1:5463/questura_readiness_cutover \
 *   READINESS_PG_BINDIR=<dir with pg_dump/psql 17> \
 *     pnpm readiness:cutover
 *
 * The laptop's database (Postgres 16) moves to Neon (Postgres 17), and the new
 * API starts with secrets the laptop never had. Both halves can break things
 * without an error at boot, so this does the move on sandbox data, in the
 * order `docs/procedures/cutover.md` gives, and checks what a person doing it
 * for real would have to check:
 *
 *  1. **Before.** On the running stack (the "laptop", old secrets): a member
 *     signs in, staff signs in, a reader signs up with (fake) Google so a
 *     Google token is stored encrypted under the old secret, and the Location
 *     Manager service account gets a key that works. The cookies, the staff
 *     token and the key are kept in memory for step 4.
 *  2. **Dump and restore.** The sandbox (Postgres 16) is dumped with a 17
 *     client and restored into Postgres 17 with `ON_ERROR_STOP` in one
 *     transaction. Critical row counts must match.
 *  3. **Migrate.** Railway's own pre-deploy step (`scripts/deploy/pre-deploy.sh`:
 *     guard, `payload migrate`, guard `--require-clean`, search backfill) runs
 *     against the restored database with the new `PAYLOAD_SECRET`. Counts are
 *     compared again after it.
 *  4. **Boot with every secret rotated** — `PAYLOAD_SECRET`,
 *     `BETTER_AUTH_SECRET`, `ORIGIN_AUTH_SECRET`, the Stripe webhook signing
 *     secret — on an empty Redis (database 1 of the sandbox Redis, standing in
 *     for Railway's new one), and prove: the old origin secret is refused;
 *     old visitor cookies and old staff tokens are signed-out answers (401 on
 *     private routes), never 500; password, fake-Google (new and previously
 *     linked) and staff sign-in work; the old service key gets 401 and a key
 *     re-issued by an admin works; the old webhook secret is refused and the
 *     new one accepted.
 *
 * Nothing here reaches the live laptop, Stripe or Google. The target must be
 * a loopback Postgres on a spare port named `questura_readiness_cutover`.
 */

import { spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Client, Pool } from 'pg'

import { backendEnv, SANDBOX_WEBHOOK_SECRET, SERVER_DIR, startApp, waitForApp } from './apps'
import { migrationEnv } from './bootstrap'
import { FaultReceiver } from './fault-receiver'
import { LAUNCH_MANIFEST_PATH, STAFF_EMAIL, SYNTHETIC_PASSWORD, type LaunchManifest } from './launch-corpus'
import type { FakeGoogleIdentity } from './oauth-fake'
import { assertPreflight } from './preflight'
import { sandboxSettings, sourceIdentity } from './sandbox'
import { freshRateLimits, readStackState, STACK_DIST, STACK_PORTS } from './stack'

const ORIGIN_HEADER = 'x-questura-origin-auth'
const TARGET_DATABASE = 'questura_readiness_cutover'
const TARGET_PORT = 4103
const RUNS = resolve(process.cwd(), '../../docs/capacity/runs')
const PG_BINDIR = process.env.READINESS_PG_BINDIR?.trim()
const EXPECT_MAJOR = Number(process.env.READINESS_CUTOVER_EXPECT_MAJOR?.trim() || 17)
/** Ports the target may never be on: development, the live laptop, the sandbox itself. */
const FORBIDDEN_TARGET_PORTS = new Set([5432, 5433, 5442, 6379, 6390])
const SERVICE_ACCOUNT = 'Location Manager'

type Check = { group: string; name: string; ok: boolean; detail: string }
const checks: Check[] = []
function record(group: string, name: string, ok: unknown, detail = ''): boolean {
  const passed = Boolean(ok)
  checks.push({ group, name, ok: passed, detail })
  console.log(`${passed ? '  ok  ' : ' FAIL '} [${group}] ${name}${detail ? ` — ${detail}` : ''}`)
  return passed
}

let address = 0
const caller = () => {
  address += 1
  return `198.18.${50 + Math.floor(address / 250)}.${(address % 250) + 1}`
}
const run = Date.now().toString(36)
const googleSub = () => `2${String(Date.now()).slice(-9)}${randomBytes(4).readUInt32BE(0).toString().padStart(10, '0')}`

// ------------------------------------------------------------------ targets

function targetUri(): URL {
  const raw = process.env.READINESS_CUTOVER_TARGET_URI?.trim()
  if (!raw) {
    throw new Error(
      'Set READINESS_CUTOVER_TARGET_URI to a throwaway Postgres 17, e.g. ' +
        `postgres://postgres@127.0.0.1:5463/${TARGET_DATABASE} (see the header of this file).`,
    )
  }
  const url = new URL(raw)
  const port = Number(url.port || 5432)
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) throw new Error('The cutover target must be on loopback.')
  if (FORBIDDEN_TARGET_PORTS.has(port)) throw new Error(`Port ${port} is not a spare port. Use another loopback port for the Postgres 17 target.`)
  if (url.pathname !== `/${TARGET_DATABASE}`) throw new Error(`The cutover target database must be named ${TARGET_DATABASE}.`)
  return url
}

function withDatabase(uri: URL | string, database: string): string {
  const url = new URL(uri.toString())
  url.pathname = `/${database}`
  return url.toString()
}

function pgTool(name: 'pg_dump' | 'psql'): string {
  return PG_BINDIR ? join(PG_BINDIR, name) : name
}

function toolMajor(name: 'pg_dump' | 'psql'): number {
  const result = spawnSync(pgTool(name), ['--version'], { encoding: 'utf8' })
  const match = (result.stdout ?? '').match(/(\d+)(?:\.\d+)?/)
  if (result.status !== 0 || !match) throw new Error(`Cannot run ${pgTool(name)} --version.`)
  return Number(match[1])
}

function connection(uri: string): string[] {
  const url = new URL(uri)
  return ['-h', url.hostname, '-p', url.port || '5432', ...(url.username ? ['-U', decodeURIComponent(url.username)] : []), '-d', url.pathname.slice(1)]
}

async function serverVersion(uri: string): Promise<string> {
  const client = new Client({ connectionString: uri })
  await client.connect()
  try {
    return String((await client.query('SHOW server_version')).rows[0].server_version).split(' ')[0]!
  } finally {
    await client.end()
  }
}

async function recreateTarget(target: URL): Promise<void> {
  const admin = new Client({ connectionString: withDatabase(target, 'postgres') })
  await admin.connect()
  try {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [TARGET_DATABASE])
    await admin.query(`DROP DATABASE IF EXISTS "${TARGET_DATABASE}"`)
    await admin.query(`CREATE DATABASE "${TARGET_DATABASE}"`)
  } finally {
    await admin.end()
  }
}

const COUNTED = [
  'locations',
  'articles',
  'media_assets',
  'media_sets',
  'users',
  'service_accounts',
  'visitor_profiles',
  'visitor_auth_users',
  'visitor_auth_accounts',
  'visitor_auth_sessions',
  'visitor_auth_verifications',
  'bookmarks',
  'stripe_webhook_events',
  'payload_migrations',
] as const

async function counts(uri: string): Promise<Record<string, number>> {
  const client = new Client({ connectionString: uri })
  await client.connect()
  try {
    const out: Record<string, number> = {}
    for (const table of COUNTED) out[table] = Number((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n)
    return out
  } finally {
    await client.end()
  }
}

// ------------------------------------------------------------------ browser

type Answer = { status: number; location: string | null; text: string; json: any }

/**
 * One reader's browser against one backend: its own cookie jar, its own
 * address, the origin secret that backend's front door would add. URLs on the
 * browser-facing API origin are sent to `base` instead.
 */
class Browser {
  readonly jar = new Map<string, string>()
  readonly ip = caller()
  constructor(
    private base: string,
    private publicOrigin: string,
    private clientOrigin: string,
    private originSecret: string,
  ) {}

  /** The same cookies, pointed at another backend (the cookie a reader brings to the new host). */
  carryTo(base: string, originSecret: string): Browser {
    const moved = new Browser(base, this.publicOrigin, this.clientOrigin, originSecret)
    for (const [name, value] of this.jar) moved.jar.set(name, value)
    return moved
  }

  cookie(): string {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  async request(
    path: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string>; navigation?: boolean } = {},
  ): Promise<Answer> {
    const url = path.startsWith(this.publicOrigin) ? `${this.base}${path.slice(this.publicOrigin.length)}` : path.startsWith('http') ? path : `${this.base}${path}`
    const method = init.method ?? 'GET'
    const response = await fetch(url, {
      method,
      redirect: 'manual',
      headers: {
        'cf-connecting-ip': this.ip,
        [ORIGIN_HEADER]: this.originSecret,
        ...(init.navigation ? { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' } : { origin: this.clientOrigin, 'sec-fetch-site': 'same-site' }),
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...(this.jar.size ? { cookie: this.cookie() } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const at = pair!.indexOf('=')
      const name = pair!.slice(0, at).trim()
      const value = pair!.slice(at + 1).trim()
      const expired = attributes.some((attribute) => /max-age=0\b/i.test(attribute.trim()))
      if (expired || value === '') this.jar.delete(name)
      else this.jar.set(name, value)
    }
    const text = await response.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // Not JSON.
    }
    return { status: response.status, location: response.headers.get('location'), text, json }
  }

  async me(): Promise<{ status: number; id: string | null; email: string | null; member: boolean }> {
    const answer = await this.request('/api/me')
    const principal = answer.json?.authenticated ? answer.json.principal : null
    return { status: answer.status, id: principal?.id ?? null, email: principal?.email ?? null, member: Boolean(principal?.membership?.active) }
  }

  async passwordSignIn(email: string, password = SYNTHETIC_PASSWORD): Promise<Answer> {
    return this.request('/api/visitor-auth/sign-in/email', { method: 'POST', body: { email, password } })
  }

  /** The client's Google button, the fake consent screen, and the redirect back. */
  async googleSignIn(fake: string, identity: FakeGoogleIdentity): Promise<Answer> {
    const start = await this.request('/api/visitor-auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'google', callbackURL: `${this.clientOrigin}/account`, errorCallbackURL: `${this.clientOrigin}/auth-error` },
    })
    if (start.status !== 200 || !start.json?.url) throw new Error(`sign-in/social answered ${start.status}: ${start.text.slice(0, 200)}`)
    const screen = new URL(`${fake}/o/oauth2/v2/auth${new URL(start.json.url).search}`)
    screen.searchParams.set('readiness_as', Buffer.from(JSON.stringify(identity)).toString('base64url'))
    const consent = await fetch(screen, { redirect: 'manual' })
    const callback = consent.headers.get('location')
    if (consent.status !== 302 || !callback) throw new Error(`fake consent answered ${consent.status}: ${(await consent.text()).slice(0, 200)}`)
    return this.request(callback, { navigation: true })
  }
}

const sessionCookieIn = (browser: Browser) => [...browser.jar.keys()].some((name) => /questura_visitor\.session_token$/.test(name))

// ------------------------------------------------------------------ staff and keys

async function staffLogin(base: string, clientOrigin: string, originSecret: string): Promise<{ status: number; token: string | null; cookie: string | null }> {
  const attempt = () =>
    fetch(`${base}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: clientOrigin, 'cf-connecting-ip': caller(), [ORIGIN_HEADER]: originSecret },
      body: JSON.stringify({ email: STAFF_EMAIL, password: SYNTHETIC_PASSWORD }),
    })
  let response = await attempt()
  if (response.status === 429) {
    const wait = Math.min(Number(response.headers.get('retry-after') ?? 60), 65)
    console.log(`  info staff sign-in is rate limited; waiting ${wait} s`)
    await new Promise((done) => setTimeout(done, wait * 1000))
    response = await attempt()
  }
  const body = (await response.json().catch(() => null)) as { token?: string } | null
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0]!)
    .find((pair) => pair.startsWith('payload-token='))
  return { status: response.status, token: body?.token ?? null, cookie: cookie ?? null }
}

/**
 * The Location Manager's own upload route, called the way it calls it
 * (multipart), minus the image: 401 without an identity, 400 ("source file is
 * required") once the caller is someone allowed to upload.
 */
async function fromSource(base: string, originSecret: string, authorization: string): Promise<number> {
  const form = new FormData()
  form.set('data', '{}')
  const response = await fetch(`${base}/api/media-sets/from-source`, {
    method: 'POST',
    headers: { authorization, 'cf-connecting-ip': caller(), [ORIGIN_HEADER]: originSecret },
    body: form,
  })
  await response.text()
  return response.status
}

/** Issue `key` on the named service account, creating it if it is missing, the way an admin does from the panel. */
async function issueKey(base: string, originSecret: string, clientOrigin: string, staffToken: string, key: string): Promise<{ status: number; id: number | null }> {
  const headers = { 'content-type': 'application/json', authorization: `JWT ${staffToken}`, origin: clientOrigin, 'cf-connecting-ip': caller(), [ORIGIN_HEADER]: originSecret }
  const found = await fetch(`${base}/api/service-accounts?where[name][equals]=${encodeURIComponent(SERVICE_ACCOUNT)}&limit=1&depth=0`, { headers })
  const list = (await found.json().catch(() => null)) as { docs?: Array<{ id: number }> } | null
  if (found.status !== 200) return { status: found.status, id: null }
  const existing = list?.docs?.[0]?.id
  const response = existing
    ? await fetch(`${base}/api/service-accounts/${existing}`, { method: 'PATCH', headers, body: JSON.stringify({ enableAPIKey: true, apiKey: key }) })
    : await fetch(`${base}/api/service-accounts`, { method: 'POST', headers, body: JSON.stringify({ name: SERVICE_ACCOUNT, enableAPIKey: true, apiKey: key }) })
  const body = (await response.json().catch(() => null)) as { doc?: { id?: number } } | null
  return { status: response.status, id: body?.doc?.id ?? existing ?? null }
}

// ------------------------------------------------------------------ webhook

function signWebhook(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`
}

async function deliverWebhook(base: string, originSecret: string, secret: string, id: string): Promise<number> {
  const payload = JSON.stringify({
    id,
    object: 'event',
    type: 'customer.updated',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: { id: 'cus_readiness_cutover', object: 'customer', name: 'Cutover Probe' } },
  })
  const response = await fetch(`${base}/api/payments/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signWebhook(payload, secret), 'cf-connecting-ip': caller(), [ORIGIN_HEADER]: originSecret },
    body: payload,
  })
  await response.text()
  return response.status
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  const sandbox = sandboxSettings()
  assertPreflight(sandbox)
  const target = targetUri()
  assertPreflight({ ...sandbox, databaseUri: target.toString() })
  if (new URL(sandbox.databaseUri).pathname !== '/questura_readiness') throw new Error('The source must be the sandbox database, questura_readiness.')
  const stack = readStackState()
  if (!stack?.secrets.originAuth) throw new Error('No stack with a front door is running: pnpm readiness:stack -- up')
  if (!stack.processes.some((process_) => process_.role === 'oauth-fake')) throw new Error('This stack has no fake Google. Restart it.')
  await freshRateLimits()

  const manifest = JSON.parse(readFileSync(LAUNCH_MANIFEST_PATH, 'utf8')) as LaunchManifest
  const memberA = manifest.identities.find((identity) => identity.label === 'member-a')!
  const gated = manifest.pieces.find((piece) => piece.status === 'published' && piece.access === 'member' && piece.markers.member)!
  const clientOrigin = stack.origins.client
  const publicOrigin = stack.origins.backend
  const fake = `http://127.0.0.1:${STACK_PORTS.oauth}`
  const laptop = `http://127.0.0.1:${STACK_PORTS.backend}` // through the stand-in door, old secrets
  const oldOrigin = stack.secrets.originAuth
  const source = sandbox.databaseUri

  // --- 1. Before: state the laptop holds at the final dump -------------------
  const before = 'before (laptop, old secrets)'
  const oldMember = new Browser(laptop, publicOrigin, clientOrigin, oldOrigin)
  const signedIn = await oldMember.passwordSignIn(memberA.email)
  record(before, 'member A signs in', signedIn.status === 200 && sessionCookieIn(oldMember), `HTTP ${signedIn.status}`)
  record(before, '…and /api/me is member A, a member', (await oldMember.me()).member)

  const oldStaff = await staffLogin(laptop, clientOrigin, oldOrigin)
  record(before, 'staff signs in', oldStaff.status === 200 && oldStaff.token && oldStaff.cookie, `HTTP ${oldStaff.status}`)

  const linked: FakeGoogleIdentity = { sub: googleSub(), email: `cutover-google-${run}@example.test`, email_verified: true, name: 'Cutover Google' }
  const googleBrowser = new Browser(laptop, publicOrigin, clientOrigin, oldOrigin)
  const googleLanding = await googleBrowser.googleSignIn(fake, linked)
  const googleUser = await googleBrowser.me()
  record(before, 'a reader signs up with Google', googleLanding.location === `${clientOrigin}/account` && googleUser.id, `HTTP ${googleLanding.status} → ${googleLanding.location}`)

  const sourcePool = new Pool({ connectionString: source, max: 2 })
  const storedToken = (
    await sourcePool.query(`SELECT "accessToken" AS token FROM visitor_auth_accounts WHERE "providerId" = 'google' AND "accountId" = $1`, [linked.sub])
  ).rows[0]?.token as string | undefined
  record(before, '…and a Google token is stored, encrypted (not the token itself)', storedToken && !storedToken.startsWith('ya29') && storedToken.length > 20, storedToken ? `${storedToken.length} chars` : 'none')

  const oldKey = randomBytes(32).toString('hex')
  const oldIssue = await issueKey(laptop, oldOrigin, clientOrigin, oldStaff.token ?? '', oldKey)
  record(before, `an admin issues the ${SERVICE_ACCOUNT} key`, [200, 201].includes(oldIssue.status) && oldIssue.id, `HTTP ${oldIssue.status}`)
  const oldKeyStatus = await fromSource(laptop, oldOrigin, `service-accounts API-Key ${oldKey}`)
  record(before, '…and it works on its route (400 for an empty body, not 401)', oldKeyStatus === 400, `HTTP ${oldKeyStatus}`)
  record(before, 'the laptop accepts a webhook signed with its secret', (await deliverWebhook(laptop, oldOrigin, SANDBOX_WEBHOOK_SECRET, `evt_cutover_before_${run}`)) === 200)
  await sourcePool.end()

  // --- 2. Dump (a 17 client) and restore into Postgres 17 ---------------------
  const move = 'dump and restore'
  const versions = { source: await serverVersion(source), target: '', pgDump: toolMajor('pg_dump'), psql: toolMajor('psql') }
  if (versions.pgDump < EXPECT_MAJOR || versions.psql < EXPECT_MAJOR) {
    throw new Error(`pg_dump/psql ${versions.pgDump}/${versions.psql} are older than Postgres ${EXPECT_MAJOR}. Point READINESS_PG_BINDIR at 17 clients.`)
  }
  await recreateTarget(target)
  versions.target = await serverVersion(target.toString())
  record(move, `the target runs Postgres ${EXPECT_MAJOR}`, Number.parseInt(versions.target, 10) === EXPECT_MAJOR, `source ${versions.source} → target ${versions.target}, pg_dump ${versions.pgDump}, psql ${versions.psql}`)

  const countsSource = await counts(source)
  const work = mkdtempSync(join(tmpdir(), 'questura-cutover-'))
  const dumpPath = join(work, 'questura.sql')
  const dumpStarted = Date.now()
  const dump = spawnSync(pgTool('pg_dump'), [...connection(source), '--no-owner', '--no-privileges'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 })
  record(move, 'pg_dump of the sandbox succeeds', dump.status === 0 && dump.stdout.length > 0, (dump.stderr || '').trim().slice(0, 200))
  writeFileSync(dumpPath, dump.stdout ?? '')
  const dumpMs = Date.now() - dumpStarted
  const restoreStarted = Date.now()
  const restore = spawnSync(pgTool('psql'), ['-q', '-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', ...connection(target.toString())], {
    input: readFileSync(dumpPath),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  const restoreMs = Date.now() - restoreStarted
  record(move, 'it restores into Postgres 17 with ON_ERROR_STOP, one transaction', restore.status === 0, (restore.stderr || '').trim().slice(0, 300))
  const countsRestored = await counts(target.toString())
  for (const table of COUNTED) record(move, `${table}: same count`, countsRestored[table] === countsSource[table], `${countsSource[table]} → ${countsRestored[table]}`)

  // --- 3. Migrate: Railway's pre-deploy step, new PAYLOAD_SECRET --------------
  const migrate = 'migrate'
  const rotated = {
    payloadSecret: randomBytes(32).toString('hex'),
    betterAuthSecret: randomBytes(32).toString('hex'),
    stripeWebhookSecret: `whsec_${randomBytes(24).toString('hex')}`,
  }
  const newOrigin = randomBytes(32).toString('hex')
  const preDeployStarted = Date.now()
  const preDeploy = spawnSync('bash', ['scripts/deploy/pre-deploy.sh'], {
    cwd: SERVER_DIR(),
    env: { ...migrationEnv(target.toString()), PAYLOAD_SECRET: rotated.payloadSecret, BETTER_AUTH_SECRET: rotated.betterAuthSecret },
    encoding: 'utf8',
    input: '',
    maxBuffer: 64 * 1024 * 1024,
  })
  const preDeployMs = Date.now() - preDeployStarted
  const preDeployOut = `${preDeploy.stdout ?? ''}${preDeploy.stderr ?? ''}`
  record(
    migrate,
    'pre-deploy.sh passes on the restored database (guard, migrate, guard --require-clean, search backfill)',
    preDeploy.status === 0 && preDeployOut.includes('Pre-deploy complete'),
    preDeploy.status === 0 ? `${preDeployMs} ms` : preDeployOut.slice(-600),
  )
  const countsMigrated = await counts(target.toString())
  for (const table of COUNTED) record(migrate, `${table}: same count after migrate`, countsMigrated[table] === countsRestored[table], `${countsRestored[table]} → ${countsMigrated[table]}`)

  // --- 4. Boot the new host: every secret rotated, empty Redis ---------------
  const receiver = new FaultReceiver()
  const receiverPort = await receiver.listen()
  const revalidationSecret = randomBytes(24).toString('hex')
  receiver.expectedSecret = revalidationSecret
  const backend = startApp(
    'cutover',
    SERVER_DIR(),
    TARGET_PORT,
    backendEnv({
      ports: { backend: TARGET_PORT, client: receiverPort },
      databaseUri: target.toString(),
      // Database 1: empty, standing in for Railway's new Redis. Nothing else uses it.
      redisUri: `redis://127.0.0.1:${STACK_PORTS.redis}/1`,
      dist: STACK_DIST,
      revalidationSecret,
      dbStatsSecret: randomBytes(24).toString('hex'),
      instanceId: 'readiness-cutover-backend',
      // The same browser-facing origins: the fake Google has one registered callback.
      browser: { clientOrigin, backendOrigin: publicOrigin },
      renderToken: randomBytes(24).toString('hex'),
      originAuthSecret: newOrigin,
      outboundLog: stack.outboundLog,
      stripeStubUrl: `http://127.0.0.1:${STACK_PORTS.stripe}`,
      fakeProviderUrl: fake,
      rotated,
    }),
  )
  const host = `http://127.0.0.1:${TARGET_PORT}`

  try {
    const boot = 'new host'
    const ready = await waitForApp(`${host}/api/health`, 120_000)
    record(boot, 'the backend boots on Postgres 17 with every secret rotated', ready)
    if (!ready) throw new Error('The new host did not start; nothing after this would measure anything.')

    const probe = async (secret: string | null) =>
      (await fetch(`${host}/api/me`, { headers: { 'cf-connecting-ip': caller(), ...(secret ? { [ORIGIN_HEADER]: secret } : {}) } })).status
    record(boot, 'a caller without the origin secret gets 403', (await probe(null)) === 403)
    record(boot, 'the laptop’s origin secret gets 403', (await probe(oldOrigin)) === 403)
    record(boot, 'the new origin secret is let in', (await probe(newOrigin)) === 200)

    // Old credentials: signed-out answers, never 500.
    const old = 'old credentials'
    const carried = oldMember.carryTo(host, newOrigin)
    const carriedMe = await carried.me()
    record(old, 'an old visitor cookie: /api/me says signed out (200), not 500', carriedMe.status === 200 && carriedMe.id === null, `HTTP ${carriedMe.status}`)
    const bookmarks = await carried.request('/api/account/bookmarks')
    record(old, 'an old visitor cookie: a private route (bookmarks) answers 401, not 500', bookmarks.status === 401, `HTTP ${bookmarks.status}`)
    const methods = await carried.request('/api/account/auth-methods')
    record(old, 'an old visitor cookie: sign-in methods answer 401, not 500', methods.status === 401, `HTTP ${methods.status}`)
    const session = await carried.request('/api/visitor-auth/get-session?disableCookieCache=true')
    record(old, 'an old visitor cookie: get-session finds no session, not 500', session.status < 500 && !session.json?.user, `HTTP ${session.status}`)
    const body = await carried.request(`/api/public/articles/full?type=${gated.type}&id=${gated.id}&lang=en`)
    record(old, 'an old visitor cookie does not open a member body', body.status < 500 && !body.text.includes(gated.markers.member!), `HTTP ${body.status}`)

    const oldJwt = await fromSource(host, newOrigin, `JWT ${oldStaff.token}`)
    record(old, 'an old staff token: 401 on a staff route, not 500', oldJwt === 401, `HTTP ${oldJwt}`)
    const staffMe = await fetch(`${host}/api/users/me`, { headers: { cookie: oldStaff.cookie ?? '', origin: clientOrigin, 'cf-connecting-ip': caller(), [ORIGIN_HEADER]: newOrigin } })
    const staffMeBody = (await staffMe.json().catch(() => null)) as { user?: unknown } | null
    record(old, 'an old staff cookie: /api/users/me is nobody, not 500', staffMe.status === 200 && !staffMeBody?.user, `HTTP ${staffMe.status}`)

    const oldKeyOnNew = await fromSource(host, newOrigin, `service-accounts API-Key ${oldKey}`)
    record(old, `the old ${SERVICE_ACCOUNT} key gets 401`, oldKeyOnNew === 401, `HTTP ${oldKeyOnNew}`)

    const oldHook = await deliverWebhook(host, newOrigin, SANDBOX_WEBHOOK_SECRET, `evt_cutover_old_${run}`)
    record(old, 'a webhook signed with the laptop endpoint’s secret gets 400', oldHook === 400, `HTTP ${oldHook}`)

    // Sign-in on the new host.
    const signIn = 'sign-in'
    const member = new Browser(host, publicOrigin, clientOrigin, newOrigin)
    const password = await member.passwordSignIn(memberA.email)
    const memberMe = await member.me()
    record(signIn, 'member A signs in with the restored password', password.status === 200 && memberMe.email === memberA.email, `HTTP ${password.status}`)
    record(signIn, '…is still a member', memberMe.member)
    const memberBody = await member.request(`/api/public/articles/full?type=${gated.type}&id=${gated.id}&lang=en`)
    record(signIn, '…and is served the member body', memberBody.status === 200 && memberBody.text.includes(gated.markers.member!), `HTTP ${memberBody.status}`)

    const fresh: FakeGoogleIdentity = { sub: googleSub(), email: `cutover-new-google-${run}@example.test`, email_verified: true, name: 'Cutover New' }
    const newGoogle = new Browser(host, publicOrigin, clientOrigin, newOrigin)
    const newLanding = await newGoogle.googleSignIn(fake, fresh)
    record(signIn, 'a new reader signs up with (fake) Google', newLanding.location === `${clientOrigin}/account` && (await newGoogle.me()).email === fresh.email, `HTTP ${newLanding.status} → ${newLanding.location}`)

    const returning = new Browser(host, publicOrigin, clientOrigin, newOrigin)
    const returningLanding = await returning.googleSignIn(fake, linked)
    const returningMe = await returning.me()
    record(
      signIn,
      'a reader whose Google token was stored under the old secret signs in with Google, as the same user',
      returningLanding.location === `${clientOrigin}/account` && returningMe.id === googleUser.id,
      `HTTP ${returningLanding.status} → ${returningLanding.location}`,
    )
    const accounts = await returning.request('/api/visitor-auth/list-accounts')
    record(signIn, '…and listing their sign-in methods works (200, Google listed)', accounts.status === 200 && JSON.stringify(accounts.json ?? '').includes('google'), `HTTP ${accounts.status}`)
    const targetPool = new Pool({ connectionString: target.toString(), max: 2 })
    const reEncrypted = (
      await targetPool.query(`SELECT "accessToken" AS token FROM visitor_auth_accounts WHERE "providerId" = 'google' AND "accountId" = $1`, [linked.sub])
    ).rows[0]?.token as string | undefined
    record(signIn, '…and their stored Google token was replaced (now under the new secret)', reEncrypted && reEncrypted !== storedToken)

    const staff = await staffLogin(host, clientOrigin, newOrigin)
    record(signIn, 'staff signs in with the restored password', staff.status === 200 && staff.token, `HTTP ${staff.status}`)
    const list = await fetch(`${host}/api/service-accounts?limit=10&depth=0`, {
      headers: { authorization: `JWT ${staff.token}`, 'cf-connecting-ip': caller(), [ORIGIN_HEADER]: newOrigin },
    })
    await list.text()
    record(signIn, 'staff can list service accounts whose keys were stored under the old secret (200, not 500)', list.status === 200, `HTTP ${list.status}`)

    // Keys: re-issue, and the new one works.
    const keys = 'service keys'
    const newKey = randomBytes(32).toString('hex')
    const reissue = await issueKey(host, newOrigin, clientOrigin, staff.token ?? '', newKey)
    record(keys, `an admin re-issues the ${SERVICE_ACCOUNT} key on the new host`, reissue.status === 200 && reissue.id === oldIssue.id, `HTTP ${reissue.status}`)
    const newKeyStatus = await fromSource(host, newOrigin, `service-accounts API-Key ${newKey}`)
    record(keys, 'the new key works on its route (400 for an empty body, not 401)', newKeyStatus === 400, `HTTP ${newKeyStatus}`)
    record(keys, 'the old key still gets 401 after the re-issue', (await fromSource(host, newOrigin, `service-accounts API-Key ${oldKey}`)) === 401)

    const hooks = 'stripe webhook'
    const newHook = await deliverWebhook(host, newOrigin, rotated.stripeWebhookSecret, `evt_cutover_new_${run}`)
    record(hooks, 'a webhook signed with the new endpoint’s secret gets 200', newHook === 200, `HTTP ${newHook}`)
    await targetPool.end()
  } finally {
    backend.kill('SIGTERM')
    await receiver.close()
  }

  const failed = checks.filter((entry) => !entry.ok)
  const stamp = new Date().toISOString().slice(0, 10)
  writeFileSync(
    resolve(RUNS, `${stamp}-cutover-rehearsal.json`),
    JSON.stringify(
      {
        kind: 'cutover-rehearsal',
        takenAt: new Date().toISOString(),
        source: sourceIdentity(),
        from: `questura_readiness (Postgres ${versions.source})`,
        to: `${TARGET_DATABASE} (Postgres ${versions.target})`,
        postgres: versions,
        rotated: ['PAYLOAD_SECRET', 'BETTER_AUTH_SECRET', 'ORIGIN_AUTH_SECRET', 'STRIPE_WEBHOOK_SECRET', 'QUESTURA_REVALIDATION_SECRET', 'QUESTURA_RENDER_TOKEN', 'DB_STATS_SECRET'],
        dumpMs,
        restoreMs,
        preDeployMs,
        counts: { source: countsSource, restored: countsRestored, migrated: countsMigrated },
        result: { total: checks.length, passed: checks.length - failed.length },
        checks,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    `\nPostgres ${versions.source} → ${versions.target}. Dump ${dumpMs} ms, restore ${restoreMs} ms, pre-deploy ${preDeployMs} ms. ` +
      `${checks.length - failed.length}/${checks.length} cutover checks passed.`,
  )
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
