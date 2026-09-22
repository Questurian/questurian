/**
 * The refusal that stands between a readiness experiment and real data.
 *
 * Every task in the local readiness plan mutates a database, drains a queue,
 * or injects a fault. The failure mode is not that an experiment breaks — it
 * is that an experiment runs against `google-login`, the live laptop, or a
 * live Stripe key, and nobody notices until something is gone. So nothing in
 * `scripts/readiness` opens a connection or sends a request before this file
 * has looked at the settings and agreed.
 *
 * The rules are deliberately narrow and deliberately not overridable:
 *
 *  - the database name must be on `ALLOWED_DATABASES`, which contains only
 *    names that exist to be dropped;
 *  - every host must be loopback, so nothing can reach the laptop or a
 *    provider even if a URL is pasted in by mistake;
 *  - a live-looking Stripe key, a Bunny key or a real SMTP host is a refusal
 *    rather than a warning, because the plan forbids paid calls outright;
 *  - the normal development ports (client 3000, server 4000) are refused for
 *    sandbox processes, so an experiment cannot quietly become the thing the
 *    owner is looking at in a browser.
 *
 * `collectPreflightProblems` is pure and unit-tested. `assertPreflight` is
 * what callers use; it throws with every problem listed at once, because
 * finding the second mistake after fixing the first is how people give up and
 * disable the check.
 */

export const ALLOWED_DATABASES = [
  'questura_readiness',
  'questura_readiness_restore',
  'questura_readiness_scratch',
] as const

/** Ports that belong to the owner's ordinary development, not to a sandbox. */
export const RESERVED_PORTS = [3000, 3003, 4000, 4003, 5432, 5433, 6379] as const

/**
 * Loopback, and only loopback. `0.0.0.0` used to be on this list; it is a
 * bind address meaning "every interface", so a sandbox pointed at it was
 * reachable from the network while the preflight reported loopback-only
 * (surge plan L00). `*.localhost` names are loopback by definition (RFC 6761).
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost')
}

export type SandboxSettings = {
  /** Postgres URI for the disposable database. */
  databaseUri: string
  /** Redis URI for the sandbox instance. Empty means "no Redis in this run". */
  redisUri: string
  /** Key prefix every sandbox Redis key carries. */
  redisNamespace: string
  /** Where the sandbox frontend receiver listens. */
  frontendUrl: string
  /** Where the sandbox backend listens, when one is started. */
  backendUrl: string
  /** Everything else the run was handed, checked for live credentials. */
  env: Record<string, string | undefined>
}

function hostOf(value: string): { host: string; port: number | null } | null {
  try {
    const url = new URL(value)
    return { host: url.hostname.toLowerCase(), port: url.port ? Number(url.port) : null }
  } catch {
    return null
  }
}

function databaseNameOf(uri: string): string | null {
  try {
    const path = new URL(uri).pathname.replace(/^\//, '')
    return path ? decodeURIComponent(path.split('?')[0]!) : null
  } catch {
    return null
  }
}

/**
 * Credentials that must never be in scope for a local run. Matched on the
 * shape of the value, not on the variable name, because the variable a live
 * key arrives in is exactly what a mistake gets wrong.
 */
function liveCredentialProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = []

  for (const [name, raw] of Object.entries(env)) {
    const value = raw?.trim()
    if (!value) continue

    if (/^(sk|rk)_live_/.test(value)) {
      problems.push(`${name} carries a live Stripe key. The local plan forbids any live Stripe call.`)
    }
    if (/^(sk|rk)_test_/.test(value)) {
      problems.push(
        `${name} carries a Stripe test key. Payment behaviour in this plan uses committed fixtures and local stubs only.`,
      )
    }
    if (/^pk_live_/.test(value)) {
      problems.push(`${name} carries a live Stripe publishable key.`)
    }
  }

  for (const name of ['BUNNY_API_KEY', 'BUNNY_STORAGE_API_KEY', 'RESEND_API_KEY', 'GOOGLE_MAPS_API_KEY']) {
    if (env[name]?.trim()) {
      problems.push(`${name} is set. A readiness run must not be able to make a paid call.`)
    }
  }

  return problems
}

export function collectPreflightProblems(settings: SandboxSettings): string[] {
  const problems: string[] = []

  const databaseName = databaseNameOf(settings.databaseUri)
  if (!databaseName) {
    problems.push(`DATABASE_URI is not a usable Postgres URL (${settings.databaseUri || 'unset'}).`)
  } else if (!(ALLOWED_DATABASES as readonly string[]).includes(databaseName)) {
    problems.push(
      `Database "${databaseName}" is not disposable. The sandbox may only touch: ${ALLOWED_DATABASES.join(', ')}.`,
    )
  }

  const urls: Array<{ name: string; value: string; reservedPortIsFatal: boolean }> = [
    { name: 'DATABASE_URI', value: settings.databaseUri, reservedPortIsFatal: false },
    { name: 'REDIS_URL', value: settings.redisUri, reservedPortIsFatal: true },
    { name: 'FRONTEND_URL', value: settings.frontendUrl, reservedPortIsFatal: true },
    { name: 'BACKEND_URL', value: settings.backendUrl, reservedPortIsFatal: true },
  ]

  for (const { name, value, reservedPortIsFatal } of urls) {
    if (!value.trim()) continue
    const parsed = hostOf(value)
    if (!parsed) {
      problems.push(`${name} is not a valid URL (${value}).`)
      continue
    }
    if (!isLoopbackHost(parsed.host)) {
      problems.push(`${name} points off this machine (${parsed.host}). A readiness run is loopback only.`)
    }
    if (reservedPortIsFatal && parsed.port !== null && (RESERVED_PORTS as readonly number[]).includes(parsed.port)) {
      problems.push(
        `${name} uses port ${parsed.port}, which belongs to ordinary development. Pick a sandbox port so an experiment cannot become what the owner is looking at.`,
      )
    }
  }

  if (settings.redisUri.trim() && !settings.redisNamespace.trim()) {
    problems.push('REDIS_NAMESPACE is empty. Sandbox keys must be namespaced so a flush cannot reach anything else.')
  }

  problems.push(...liveCredentialProblems(settings.env))

  return problems
}

export function assertPreflight(settings: SandboxSettings): void {
  const problems = collectPreflightProblems(settings)
  if (problems.length === 0) return

  throw new Error(
    'Readiness sandbox preflight refused this run:\n' + problems.map((problem) => `  - ${problem}`).join('\n'),
  )
}
