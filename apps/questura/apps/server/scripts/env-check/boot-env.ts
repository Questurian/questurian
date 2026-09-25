/**
 * Run the production boot check against a candidate environment, without
 * deploying it.
 *
 * `collectProductionConfigProblems()` is what `register()` runs before the
 * server serves (`shared/config/boot-guard.ts`). On 2026-09-23 running it
 * ad hoc caught the laptop missing three settings the boot check had just
 * started to require. A new platform will hit the same thing, so the check
 * is a committed step: `pnpm env:check <file>`.
 *
 * The candidate environment **replaces** `process.env` for the check. It is
 * not merged into it. Inheriting the operator's shell would let a variable
 * set locally hide one missing from the file. Every key the check reads is
 * recorded, so a test can hold the documented Railway template to the same
 * list (`railway-template.test.ts`).
 */

export type BootCheckResult = {
  problems: string[]
  /** Every `process.env` key the config modules and the check read. */
  keysRead: string[]
}

type Env = Record<string, string>

/** Read by Node or the tooling rather than the app. Never documented. */
export const RUNTIME_KEYS = new Set(['NODE_ENV', 'NODE_V8_COVERAGE', 'WATCH_REPORT_DEPENDENCIES', 'VITEST', 'TEST', 'NEXT_RUNTIME'])

/**
 * Loads the config modules fresh against `env`. Callers that run it twice in
 * one process must reset the module cache in between (vitest's
 * `vi.resetModules()`), because `APP_CONFIG` is computed at import.
 */
export async function runBootCheck(env: Env): Promise<BootCheckResult> {
  const original = process.env
  const keysRead = new Set<string>()
  const candidate: Env = { NODE_ENV: 'production', ...env }

  process.env = new Proxy(candidate, {
    get(target, key, receiver) {
      if (typeof key === 'string') keysRead.add(key)
      return Reflect.get(target, key, receiver)
    },
    has(target, key) {
      if (typeof key === 'string') keysRead.add(key)
      return Reflect.has(target, key)
    },
  }) as NodeJS.ProcessEnv

  try {
    const { collectProductionConfigProblems } = await import(
      '../../src/shared/config/assert-production-config'
    )
    return { problems: collectProductionConfigProblems(), keysRead: [...keysRead].sort() }
  } finally {
    process.env = original
  }
}

/** A template value that was never replaced: `<set in Railway: …>`. */
export const PLACEHOLDER = /^<[^>]*>$/

/** Set in the readiness sandbox or in development, never on a real platform. */
export const FORBIDDEN_IN_PRODUCTION = ['READINESS_SANDBOX', 'READINESS_STRIPE_STUB_URL', 'REFRESH_DISCONNECTED'] as const

const SECRET_NAMES = [
  'PAYLOAD_SECRET',
  'BETTER_AUTH_SECRET',
  'QUESTURA_REVALIDATION_SECRET',
  'QUESTURA_RENDER_TOKEN',
  'ORIGIN_AUTH_SECRET',
  'REFRESH_WORKER_SECRET',
  'DB_STATS_SECRET',
  'EXCHANGE_RATE_SYNC_SECRET',
] as const

function hostOf(uri: string): string | null {
  try {
    return new URL(uri).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return null
  }
}

/**
 * What the boot check cannot know, because the readiness sandbox runs real
 * production builds that legitimately break these rules. On a real platform
 * each one is an outage, a charge in the wrong mode, or a shared secret.
 */
export function platformProblems(env: Env): string[] {
  const problems: string[] = []
  const value = (key: string) => env[key]?.trim() ?? ''

  for (const [key, raw] of Object.entries(env)) {
    if (PLACEHOLDER.test(raw.trim())) problems.push(`${key} still holds the template placeholder.`)
  }

  for (const key of FORBIDDEN_IN_PRODUCTION) {
    if (value(key)) problems.push(`${key} is set. It belongs to the readiness sandbox or development, never a real platform.`)
  }

  // The site advertises live prices and takes real cards. A test key here
  // means checkout "works" and nobody is ever charged or made a member.
  const secretKey = value('STRIPE_SECRET_KEY')
  const publishableKey = value('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY')
  if (/^(sk|rk)_test_/.test(secretKey)) problems.push('STRIPE_SECRET_KEY is a test-mode key.')
  if (/^pk_test_/.test(publishableKey)) problems.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a test-mode key.')
  if (secretKey && !/^(sk|rk)_(live|test)_/.test(secretKey) && !PLACEHOLDER.test(secretKey)) {
    problems.push('STRIPE_SECRET_KEY does not look like a Stripe secret or restricted key.')
  }

  // A Resend key always starts `re_`. Anything else is a value pasted into
  // the wrong field, and it fails the first password reset, not the boot.
  const resendKey = value('RESEND_API_KEY')
  if (resendKey && !/^re_/.test(resendKey) && !PLACEHOLDER.test(resendKey)) {
    problems.push('RESEND_API_KEY does not look like a Resend API key (re_...).')
  }

  // Error reporting (launch fix plan item 3). The server boots without it, on
  // purpose: development, the sandbox and CI never set it. A real platform
  // without it has errors in its logs that nobody is told about.
  const sentryDsn = value('SENTRY_DSN')
  if (!sentryDsn) {
    problems.push('SENTRY_DSN is not set: errors would reach the logs only, and nobody is alerted (docs/procedures/sentry-setup.md).')
  } else if (!PLACEHOLDER.test(sentryDsn) && !/^https:\/\/[A-Za-z0-9]+@[A-Za-z0-9.-]+\/\d+$/.test(sentryDsn)) {
    problems.push('SENTRY_DSN does not look like a Sentry DSN (https://<key>@<host>/<project id>).')
  }

  // The front door (ADR-0016, launch fix plan item 10). Boot allows it unset,
  // because the laptop's origin sits behind its own tunnel. A Railway service
  // does not: anyone can reach its edge, name the API's host and forge
  // CF-Connecting-IP. Without the secret the app cannot tell them apart.
  if (!value('ORIGIN_AUTH_SECRET')) {
    problems.push(
      'ORIGIN_AUTH_SECRET is not set: the API would serve callers who skip Cloudflare, with any address ' +
        'they claim (docs/adr/0016-api-origin-identity-on-railway.md).'
    )
  }

  const monthly = value('STRIPE_PRICE_ID_MONTHLY')
  const legacy = value('STRIPE_PRICE_ID')
  if (monthly && legacy && monthly !== legacy) {
    problems.push('STRIPE_PRICE_ID and STRIPE_PRICE_ID_MONTHLY are both set and differ. Unset STRIPE_PRICE_ID.')
  }

  // Public image addresses are built from this host, so it must be the pull
  // zone. The storage API host (storage.bunnycdn.com, or a regional
  // ny.storage.bunnycdn.com) takes uploads with a key and serves nothing to
  // a browser: every image on the site would be broken.
  const imageHost = value('BUNNY_STORAGE_HOSTNAME')
    .replace(/^https?:\/\//, '')
    .replace(/[/:].*$/, '')
    .toLowerCase()
  if (imageHost === 'storage.bunnycdn.com' || imageHost.endsWith('.storage.bunnycdn.com')) {
    problems.push(
      `BUNNY_STORAGE_HOSTNAME is the Bunny storage API (${imageHost}). It must be the pull zone ` +
        'that serves images to readers (e.g. questurian-cdn.b-cdn.net).'
    )
  }

  // A managed platform has no database or Redis on loopback. One there is a
  // local value copied across, and the process would fail or hit the wrong store.
  for (const key of ['DATABASE_URI', 'DATABASE_URI_UNPOOLED', 'REDIS_URL']) {
    const host = hostOf(value(key))
    if (host && /^(localhost|127\.\d+\.\d+\.\d+|::1)$/.test(host)) {
      problems.push(`${key} points at loopback (${host}); a platform has no database there.`)
    }
  }

  // One value in two roles: rotating either breaks both, and a leak of one
  // is a leak of both. BETTER_AUTH_SECRET = PAYLOAD_SECRET is the known case.
  const byValue = new Map<string, string[]>()
  for (const key of SECRET_NAMES) {
    const secret = value(key)
    if (!secret || PLACEHOLDER.test(secret)) continue
    byValue.set(secret, [...(byValue.get(secret) ?? []), key])
  }
  for (const keys of byValue.values()) {
    if (keys.length > 1) problems.push(`${keys.join(' and ')} hold the same value. Each needs its own secret.`)
  }

  return problems
}

const SENSITIVE_NAME = /SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE|_KEY$|DATABASE_UR[IL]|REDIS_URL|DSN/

/**
 * The boot check already names variables, never their values. This is the
 * second lock, for output that gets pasted into a chat or a PR. The value of
 * every sensitive-looking variable is removed wherever it appears, and
 * credentials inside any URL are masked.
 */
export function redact(message: string, env: Env): string {
  let out = message
  for (const [key, value] of Object.entries(env)) {
    if (!SENSITIVE_NAME.test(key)) continue
    const trimmed = value.trim()
    if (trimmed.length >= 4) out = out.split(trimmed).join(`<${key}>`)
  }
  return out.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1<credentials>@')
}
