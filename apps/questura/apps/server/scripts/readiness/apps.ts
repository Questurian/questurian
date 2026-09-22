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
 * deleting names out of `process.env`. `next start` still loads `.env` itself,
 * which is why every dangerous name is set to an explicit placeholder instead
 * of left unset.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

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
}

export const backendUrl = (settings: AppSettings): string => `http://127.0.0.1:${settings.ports.backend}`
export const clientUrl = (settings: AppSettings): string => `http://127.0.0.1:${settings.ports.client}`

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

export function backendEnv(settings: AppSettings): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    NEXT_DIST_DIR: settings.dist,

    DATABASE_URI: settings.databaseUri,
    DATABASE_URI_UNPOOLED: settings.databaseUri,
    REDIS_URL: settings.redisUri,

    // Production refuses localhost for these two, so they are placeholders
    // that resolve to nothing. No rehearsal follows them.
    NEXT_PUBLIC_APP_URL: 'https://readiness-client.invalid',
    BACKEND_URL_LOCAL: 'https://readiness-server.invalid',
    CORS_ALLOWED_ORIGINS: 'https://readiness-client.invalid',

    TRUSTED_PROXY: 'cloudflare',
    PAYLOAD_COOKIE_DOMAIN: 'host-only',
    PAYLOAD_SECRET: 'readiness-payload-secret-not-a-real-one-0123456789abcdef0123',
    BETTER_AUTH_SECRET: 'readiness-visitor-secret-not-a-real-one-0123456789abcdef01',

    // The real client, not a receiver.
    QUESTURA_CLIENT_URL: clientUrl(settings),
    QUESTURA_REVALIDATION_SECRET: settings.revalidationSecret,
    // The harness drains. A background worker would race it and make every
    // "after the publish" observation ambiguous.
    REFRESH_WORKER_INTERVAL_MS: '0',

    STRIPE_SECRET_KEY: 'sk_readiness_placeholder_not_a_key',
    STRIPE_WEBHOOK_SECRET: 'whsec_readiness_placeholder',
    STRIPE_PRICE_ID: 'price_readiness_placeholder',
    STRIPE_PRICE_ID_MONTHLY: 'price_readiness_placeholder',

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

export function clientEnv(settings: AppSettings): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    NEXT_DIST_DIR: settings.dist,
    NEXT_PUBLIC_BACKEND_URL: backendUrl(settings),
    BACKEND_URL_LOCAL: backendUrl(settings),
    NEXT_PUBLIC_APP_URL: clientUrl(settings),
    QUESTURA_REVALIDATION_SECRET: settings.revalidationSecret,
  }
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
    const taken = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_500) })
      .then(() => true)
      .catch(() => false)
    if (taken) {
      throw new Error(
        `Port ${port} is already serving. Stop it first — this harness has to own its ports:\n` +
          `  lsof -nP -iTCP:${port} -sTCP:LISTEN`,
      )
    }
  }
}

export function startApp(name: string, cwd: string, port: number, env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn('node_modules/.bin/next', ['start', '-p', String(port)], {
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
