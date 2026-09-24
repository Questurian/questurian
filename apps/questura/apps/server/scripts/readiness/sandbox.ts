import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import { assertPreflight, type SandboxSettings } from './preflight'

/**
 * One description of the disposable environment, shared by every readiness
 * script so they cannot disagree about which database they are pointed at.
 *
 * Defaults are chosen so that running any of these scripts with no
 * environment at all lands on the sandbox rather than on anything real: a
 * database named `questura_readiness` in the sandbox container on 5442 rather
 * than anything on 5432/5433, a Redis on 6390 rather than 6379, a
 * frontend receiver on 3100 rather than 3000, a backend on 4100 rather than
 * 4000. Overrides exist, but `preflight.ts` still has to agree with them.
 *
 * The manifest is the other half of the plan's requirement: a run that cannot
 * say which code, which data and which settings produced it is not evidence.
 * It carries the source SHA *and* a fingerprint of the dirty diff, because
 * most of this work will be measured from a working tree rather than a tag.
 */

export const SANDBOX_DEFAULTS = {
  databaseName: 'questura_readiness',
  // The `questura-readiness-pg` container (`sandbox-docker.ts`), which
  // `readiness:stack -- up` starts when it is missing. It has only the
  // `postgres` role, so the default names it rather than `$USER`.
  postgresUser: 'postgres',
  postgresPort: 5442,
  redisPort: 6390,
  redisNamespace: 'readiness:',
  frontendPort: 3100,
  backendPort: 4100,
} as const

/** Variables that must be cleared before a sandbox process starts. */
export const BLOCKED_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'BUNNY_API_KEY',
  'BUNNY_STORAGE_API_KEY',
  'RESEND_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_MAPS_API_KEY',
  'EXCHANGE_RATE_API_KEY',
] as const

export function sandboxSettings(env: NodeJS.ProcessEnv = process.env): SandboxSettings {
  const databaseUri =
    env.READINESS_DATABASE_URI ??
    `postgres://${SANDBOX_DEFAULTS.postgresUser}@127.0.0.1:${SANDBOX_DEFAULTS.postgresPort}/${SANDBOX_DEFAULTS.databaseName}`

  return {
    databaseUri,
    redisUri: env.READINESS_REDIS_URL ?? `redis://127.0.0.1:${SANDBOX_DEFAULTS.redisPort}`,
    redisNamespace: env.READINESS_REDIS_NAMESPACE ?? SANDBOX_DEFAULTS.redisNamespace,
    frontendUrl: env.READINESS_FRONTEND_URL ?? `http://127.0.0.1:${SANDBOX_DEFAULTS.frontendPort}`,
    backendUrl: env.READINESS_BACKEND_URL ?? `http://127.0.0.1:${SANDBOX_DEFAULTS.backendPort}`,
    env: env as Record<string, string | undefined>,
  }
}

/**
 * The environment a sandbox child process gets: the caller's, with every
 * credential that could reach a paid service removed and the sandbox's own
 * settings substituted. Removing rather than overwriting is deliberate — an
 * empty string still satisfies a `?.trim()` check in some call sites, while an
 * absent variable makes the feature that needs it refuse.
 */
export function sandboxEnv(settings: SandboxSettings, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of BLOCKED_ENV) delete env[name]

  return {
    ...env,
    DATABASE_URI: settings.databaseUri,
    DATABASE_URI_UNPOOLED: settings.databaseUri,
    REDIS_URL: settings.redisUri,
    REDIS_KEY_PREFIX: settings.redisNamespace,
    QUESTURA_CLIENT_URL: settings.frontendUrl,
    NEXT_PUBLIC_FRONTEND_URL: settings.frontendUrl,
    BACKEND_URL_LOCAL: settings.backendUrl,
    QUESTURA_REVALIDATION_SECRET: 'readiness-sandbox-revalidation-secret',
    READINESS_SANDBOX: '1',
    ...extra,
  }
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/**
 * The source the run came from. A dirty tree gets a fingerprint of its own
 * diff: two runs from the same SHA with different uncommitted edits are two
 * different experiments, and saying so is cheaper than discovering it later.
 */
export function sourceIdentity(): { sha: string; dirty: boolean; diffFingerprint: string | null } {
  const sha = git(['rev-parse', 'HEAD'])
  const diff = git(['diff', 'HEAD'])
  return {
    sha: sha || 'unknown',
    dirty: diff.length > 0,
    diffFingerprint: diff ? createHash('sha256').update(diff).digest('hex').slice(0, 16) : null,
  }
}

export type SandboxManifest = {
  createdAt: string
  source: ReturnType<typeof sourceIdentity>
  runtime: { node: string; platform: string }
  dataset: { database: string; redisNamespace: string; seed: number }
  ports: { frontend: number | null; backend: number | null; redis: number | null }
  settings: Record<string, string>
  cleanup: { owns: string[] }
}

function portOf(url: string): number | null {
  try {
    const parsed = new URL(url)
    return parsed.port ? Number(parsed.port) : null
  } catch {
    return null
  }
}

function databaseNameOf(uri: string): string {
  try {
    return new URL(uri).pathname.replace(/^\//, '') || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Build the manifest. Throws if preflight refuses, so no caller can produce a
 * manifest describing an environment it was not allowed to create. No value
 * that could be a secret is copied in: the settings block carries URLs with
 * their credentials stripped.
 */
export function buildManifest(settings: SandboxSettings, seed: number, owns: string[]): SandboxManifest {
  assertPreflight(settings)

  const redact = (value: string): string => {
    try {
      const url = new URL(value)
      url.username = ''
      url.password = ''
      return url.toString()
    } catch {
      return value
    }
  }

  return {
    createdAt: new Date().toISOString(),
    source: sourceIdentity(),
    runtime: { node: process.version, platform: process.platform },
    dataset: {
      database: databaseNameOf(settings.databaseUri),
      redisNamespace: settings.redisNamespace,
      seed,
    },
    ports: {
      frontend: portOf(settings.frontendUrl),
      backend: portOf(settings.backendUrl),
      redis: portOf(settings.redisUri),
    },
    settings: {
      databaseUri: redact(settings.databaseUri),
      redisUri: redact(settings.redisUri),
      frontendUrl: settings.frontendUrl,
      backendUrl: settings.backendUrl,
    },
    cleanup: { owns },
  }
}
