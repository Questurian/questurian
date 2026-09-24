/**
 * The two production apps, started as real processes.
 *
 * Two harnesses need this — `frontend-cache.ts` and `publish-under-load.ts` —
 * and the part worth sharing is not the `spawn` call. It is the environment:
 * roughly forty variables, several of which are the difference between a
 * rehearsal and a process that can reach Stripe or send email. A second copy
 * of that list is a second place for one of them to be missing, and a missing
 * credential placeholder does not fail loudly — it falls back to whatever
 * `.env` put there.
 *
 * So the environment is built here, once, from scratch rather than by
 * deleting names out of `process.env`. `next start` still loads `.env` itself
 * and fills in anything unset, so every name those files define and this list
 * does not is set to the empty string (`sandbox-env.ts`), and every child
 * loads the loopback-only socket guard (`deny-outbound.cjs`).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { resolve } from 'node:path'

import { FAKE_GOOGLE } from './oauth-fake'
import { neutraliseDotenv, withFakeProviderRoute, withOutboundGuard } from './sandbox-env'

/** The sandbox backend's webhook signing secret. A placeholder: no Stripe endpoint has it. */
export const SANDBOX_WEBHOOK_SECRET = 'whsec_readiness_placeholder'

export type AppPorts = { backend: number; client: number }

export type AppSettings = {
  ports: AppPorts
  databaseUri: string
  redisUri: string
  /** The build directory both apps were built into. */
  dist: string
  /** Both apps must agree on this or every delivery is a 401. */
  revalidationSecret: string
  /** Bearer token for `/api/internal/db-stats`. */
  dbStatsSecret: string
  /** The identity the collector reports for the backend process. */
  instanceId: string
  /**
   * Origins a real browser uses. Absent: the `.invalid` placeholders, fine
   * for server-to-server harnesses. Present: `*.readiness.localhost` names,
   * which browsers resolve to loopback and treat as secure contexts, and
   * which the production origin guard accepts because they are not
   * `localhost` itself — the guard is not relaxed to make this work.
   */
  browser?: { clientOrigin: string; backendOrigin: string }
  /** Shared render token (32+ chars), generated per run. */
  renderToken?: string
  /** Where sandbox children append refused outbound attempts. */
  outboundLog?: string
  /** Run the refresh worker in-process at this interval. Default 0: the harness drains. */
  workerIntervalMs?: number
  /** The loopback Stripe stub (`stripe-stub.ts`). Without it, Stripe calls are refused at the socket. */
  stripeStubUrl?: string
  /**
   * The loopback fake Google and mailbox (`oauth-fake.ts`). Present: Google
   * sign-in is switched on with the fake's client, and the backend loads
   * `oauth-fake-route.cjs` so its calls to Google and Resend land there.
   */
  fakeProviderUrl?: string
}

export const backendUrl = (settings: AppSettings): string => `http://127.0.0.1:${settings.ports.backend}`
export const clientUrl = (settings: AppSettings): string => `http://127.0.0.1:${settings.ports.client}`

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

export function backendEnv(settings: AppSettings): NodeJS.ProcessEnv {
  const env = backendEnvDeclared(settings)
  const guarded = withOutboundGuard(neutraliseDotenv(env, SERVER_DIR()).env, settings.outboundLog)
  return settings.fakeProviderUrl ? withFakeProviderRoute(guarded) : guarded
}

function backendEnvDeclared(settings: AppSettings): NodeJS.ProcessEnv {
  const origins = settings.browser
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    NEXT_DIST_DIR: settings.dist,

    DATABASE_URI: settings.databaseUri,
    DATABASE_URI_UNPOOLED: settings.databaseUri,
    REDIS_URL: settings.redisUri,

    // Production refuses localhost for these, so a server-to-server run uses
    // placeholders that resolve to nothing; a browser run uses
    // `*.readiness.localhost` names (see `AppSettings.browser`).
    NEXT_PUBLIC_APP_URL: origins?.clientOrigin ?? 'https://readiness-client.invalid',
    BACKEND_URL_LOCAL: origins?.backendOrigin ?? 'https://readiness-server.invalid',
    CORS_ALLOWED_ORIGINS: origins?.clientOrigin ?? 'https://readiness-client.invalid',
    ...(settings.renderToken ? { QUESTURA_RENDER_TOKEN: settings.renderToken } : {}),

    TRUSTED_PROXY: 'cloudflare',
    PAYLOAD_COOKIE_DOMAIN: 'host-only',
    PAYLOAD_SECRET: 'readiness-payload-secret-not-a-real-one-0123456789abcdef0123',
    BETTER_AUTH_SECRET: 'readiness-visitor-secret-not-a-real-one-0123456789abcdef01',

    // The real client, not a receiver.
    QUESTURA_CLIENT_URL: clientUrl(settings),
    QUESTURA_REVALIDATION_SECRET: settings.revalidationSecret,
    // The harness drains. A background worker would race it and make every
    // "after the publish" observation ambiguous.
    REFRESH_WORKER_INTERVAL_MS: String(settings.workerIntervalMs ?? 0),

    STRIPE_SECRET_KEY: 'sk_readiness_placeholder_not_a_key',
    STRIPE_WEBHOOK_SECRET: SANDBOX_WEBHOOK_SECRET,
    STRIPE_PRICE_ID: 'price_readiness_monthly',
    STRIPE_PRICE_ID_MONTHLY: 'price_readiness_monthly',
    STRIPE_PRICE_ID_YEARLY: 'price_readiness_yearly',
    READINESS_SANDBOX: '1',
    ...(settings.stripeStubUrl ? { READINESS_STRIPE_STUB_URL: settings.stripeStubUrl } : {}),
    ...(settings.fakeProviderUrl
      ? {
          READINESS_FAKE_PROVIDER_URL: settings.fakeProviderUrl,
          GOOGLE_CLIENT_ID: FAKE_GOOGLE.clientId,
          GOOGLE_CLIENT_SECRET: FAKE_GOOGLE.clientSecret,
        }
      : {}),

    DATABASE_MAX_CONNECTIONS: '100',
    APP_PROCESS_COUNT: '1',
    APP_ROLLOUT_SURGE: '0',
    APP_JOB_PROCESS_COUNT: '0',
    DATABASE_POOL_PAYLOAD_MAX: '10',
    DATABASE_POOL_VISITOR_AUTH_MAX: '5',
    DATABASE_POOL_ADVISORY_LOCK_MAX: '4',

    QUESTURA_INSTANCE_ID: settings.instanceId,
    PUBLIC_API_DIAGNOSTICS: '1',
    DB_STATS_SECRET: settings.dbStatsSecret,
  }
}

/**
 * The client. `NEXT_PUBLIC_*` values are inlined at build time, so the build
 * and the start must receive the same environment — both come from here.
 * Everything `.env*` would add (a Maps browser key, the image CDN origin, a
 * Stripe publishable key) is neutralised, so a readiness build cannot ship a
 * paid key to the browser it runs.
 */
export function clientEnv(settings: AppSettings, options: { build?: boolean } = {}): NodeJS.ProcessEnv {
  const origins = settings.browser
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    NEXT_DIST_DIR: settings.dist,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_BACKEND_URL: origins?.backendOrigin ?? backendUrl(settings),
    BACKEND_URL_LOCAL: backendUrl(settings),
    NEXT_PUBLIC_APP_URL: origins?.clientOrigin ?? clientUrl(settings),
    NEXT_PUBLIC_FRONTEND_URL: origins?.clientOrigin ?? clientUrl(settings),
    QUESTURA_REVALIDATION_SECRET: settings.revalidationSecret,
    ...(settings.renderToken ? { QUESTURA_RENDER_TOKEN: settings.renderToken } : {}),
  }
  // `next/font/google` downloads its fonts during the build; that is the one
  // outbound request a readiness process may make, and only while building.
  const allow = options.build ? ['fonts.googleapis.com', 'fonts.gstatic.com'] : []
  return withOutboundGuard(neutraliseDotenv(env, CLIENT_DIR()).env, settings.outboundLog, allow)
}

export const SERVER_DIR = (): string => resolve(process.cwd())
export const CLIENT_DIR = (): string => resolve(process.cwd(), '../client')

export function assertBuilt(dist: string): void {
  for (const [label, dir] of [
    ['server', SERVER_DIR()],
    ['client', CLIENT_DIR()],
  ] as const) {
    if (!existsSync(resolve(dir, dist))) {
      throw new Error(
        `No production build for the ${label} at ${dir}/${dist}.\n` +
          `See docs/capacity/README.md — both apps have to be built, and the client's build ` +
          `needs the backend already running.`,
      )
    }
  }
}

/** True when anything at all accepts a TCP connection on the port — HTTP or not. */
export function portListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ host, port })
    const finish = (value: boolean) => {
      socket.destroy()
      done(value)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(1_000, () => finish(false))
  })
}

/**
 * Refuse to start when something already answers on a port.
 *
 * A crashed earlier run leaves its children holding their ports, and the next
 * run then measures *those* processes while believing they are its own. That
 * has happened twice in this series, and both times the result looked like a
 * passing check rather than an error.
 */
export async function assertPortsFree(ports: number[]): Promise<void> {
  for (const port of ports) {
    // A TCP probe, not an HTTP one: a Redis or a half-started server on the
    // port does not answer HTTP and would otherwise look free.
    const taken = (await portListening(port)) || (await portListening(port, '::1'))
    if (taken) {
      throw new Error(
        `Port ${port} is already serving. Stop it first — this harness has to own its ports:\n` +
          `  lsof -nP -iTCP:${port} -sTCP:LISTEN`,
      )
    }
  }
}

export function startApp(name: string, cwd: string, port: number, env: NodeJS.ProcessEnv): ChildProcess {
  // Bound to loopback explicitly. `next start` listens on every interface by
  // default, and "the harness only talks to 127.0.0.1" is not the same as
  // "nothing else can reach it".
  const child = spawn('node_modules/.bin/next', ['start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout!.on('data', (chunk: Buffer) => {
    if (process.env.READINESS_VERBOSE) console.log(`[${name}] ${chunk.toString().trim()}`)
  })
  child.stderr!.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim()
    // A boot refusal is the single most useful thing a harness can print.
    if (text && !text.includes('lockfile') && !text.includes('Consider removing')) {
      console.error(`[${name}] ${text.slice(0, 400)}`)
    }
  })
  return child
}

export async function waitForApp(
  url: string,
  timeoutMs = 90_000,
  headers: Record<string, string> = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(3_000) })
      if (response.status < 500) return true
    } catch {
      // Not up yet.
    }
    await sleep(500)
  }
  return false
}

export type BackendStats = {
  instance?: { id?: string; startedAt?: string }
  admission?: Record<
    string,
    { active: number; queued: number; admitted: number; refused: Record<string, number> }
  >
  payloadPool?: { total: number; idle: number; waiting: number }
}

/**
 * Read the backend's own counters.
 *
 * Throws rather than returning a sentinel. An earlier version returned `-1` on
 * failure, and a check then compared `-1` to `-1` and passed while a leftover
 * server from another command was answering on the port. A measurement that
 * cannot be taken has to stop the run, not equal itself.
 */
export async function readBackendStats(settings: AppSettings): Promise<BackendStats> {
  const response = await fetch(`${backendUrl(settings)}/api/internal/db-stats`, {
    headers: { authorization: `Bearer ${settings.dbStatsSecret}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) {
    throw new Error(
      `Could not read the backend's counters (HTTP ${response.status}). Something else may be ` +
        `listening on ${backendUrl(settings)}.`,
    )
  }
  return (await response.json()) as BackendStats
}

export async function ingressAdmitted(settings: AppSettings): Promise<number> {
  const stats = await readBackendStats(settings)
  const admitted = stats.admission?.ingress?.admitted
  if (typeof admitted !== 'number') {
    throw new Error('The backend answered db-stats without an ingress admission count.')
  }
  return admitted
}

/** Every admission refusal the backend has recorded, by class and reason. */
export async function ingressRefusals(settings: AppSettings): Promise<Record<string, number>> {
  const stats = await readBackendStats(settings)
  const totals: Record<string, number> = {}
  for (const [kind, gate] of Object.entries(stats.admission ?? {})) {
    for (const [reason, count] of Object.entries(gate.refused ?? {})) {
      if (count > 0) totals[`${kind}:${reason}`] = count
    }
  }
  return totals
}
