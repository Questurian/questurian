import { APP_CONFIG } from './index'
import { HOST_ONLY_COOKIE_DOMAIN, validateCookieDomain } from './session-cookie'

/**
 * Fail fast on a production boot that is still carrying development defaults.
 *
 * `APP_URLS` defaults `frontend` to `http://localhost:3000` and `backend` to
 * `http://localhost:4000` when their env vars are missing. Those defaults feed
 * `serverURL`, the Google OAuth redirect URI, Stripe success/cancel/portal
 * return URLs and password-reset links, so an unset variable in production does
 * not fail — it silently emits links pointing at the operator's own laptop.
 *
 * Deliberately checked at boot (`onInit`) rather than at module load. Module
 * scope is evaluated during `next build`, which runs with `NODE_ENV=production`
 * and without the deployment's runtime environment, so a throw there would
 * break builds rather than catch misconfiguration.
 *
 * Development is untouched: the localhost defaults remain exactly as they were.
 */

type ConfigProblem = string

function isLocalhost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(url)
}

export function collectProductionConfigProblems(): ConfigProblem[] {
  if (!APP_CONFIG.isProduction) return []

  const problems: ConfigProblem[] = []

  const requiredUrls: Array<{ name: string; value: string | undefined }> = [
    { name: 'NEXT_PUBLIC_APP_URL', value: process.env.NEXT_PUBLIC_APP_URL },
    { name: 'BACKEND_URL_LOCAL', value: process.env.BACKEND_URL_LOCAL },
  ]

  for (const { name, value } of requiredUrls) {
    if (!value || !value.trim()) {
      problems.push(`${name} is not set — URLs would fall back to localhost.`)
      continue
    }

    if (isLocalhost(value)) {
      problems.push(`${name} points at localhost (${value}).`)
    }

    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        problems.push(`${name} must use http or https (${value}).`)
      }
    } catch {
      problems.push(`${name} is not a valid URL (${value}).`)
    }
  }

  // `CORS_ORIGINS` feeds Payload `cors`, Payload `csrf` and Better Auth
  // `trustedOrigins`. Since production no longer contributes localhost entries,
  // an empty list here means the admin panel and Google sign-in are both broken.
  if (APP_CONFIG.CORS_ORIGINS.length === 0) {
    problems.push(
      'No CORS origins configured — set CORS_ALLOWED_ORIGINS, NEXT_PUBLIC_APP_URL ' +
        'or NEXT_PUBLIC_FRONTEND_URL. Payload cors/csrf and Better Auth trustedOrigins ' +
        'all read this list.'
    )
  }

  const localhostOrigins = APP_CONFIG.CORS_ORIGINS.filter(isLocalhost)
  if (localhostOrigins.length > 0) {
    problems.push(`Localhost origins configured in production: ${localhostOrigins.join(', ')}.`)
  }

  // Every rate limiter in the app counts through `shared/lib/rate-limit-counter`,
  // which needs Redis to hold one budget across instances. Better Auth throws on
  // the same variable, but only in a process that imports it; this covers the
  // Staff credential limits and the account-existence check too. Without it
  // those limiters now fail closed, so a missing variable takes auth down —
  // better caught here, at boot, than by the first locked-out operator.
  if (!APP_CONFIG.redis.url) {
    problems.push(
      'REDIS_URL is not set — the shared rate limiters have no cross-instance ' +
        'counter and refuse to count in production.'
    )
  }

  // The staff session cookie is host-only unless a `Domain` is set, and the AI
  // Blog Writer runs on a different host from Payload. Getting this wrong does
  // not fail loudly — the browser simply never sends `payload-token` to the
  // writer, and every staff-authenticated call there returns 401 with nothing
  // in the logs to explain it. Requiring the decision at boot makes a
  // same-origin deployment state itself rather than look like an oversight.
  const rawCookieDomain = process.env.PAYLOAD_COOKIE_DOMAIN?.trim() ?? ''

  if (!rawCookieDomain) {
    problems.push(
      'PAYLOAD_COOKIE_DOMAIN is not set — the staff session cookie would be ' +
        "host-only, so it is never sent to the AI Blog Writer's own hosts. Set the " +
        `registrable domain (e.g. questurian.com), or ${HOST_ONLY_COOKIE_DOMAIN} if ` +
        'every caller really is served from this host.'
    )
  } else if (rawCookieDomain.toLowerCase() !== HOST_ONLY_COOKIE_DOMAIN) {
    let backendHostname: string | undefined
    try {
      backendHostname = process.env.BACKEND_URL_LOCAL
        ? new URL(process.env.BACKEND_URL_LOCAL).hostname
        : undefined
    } catch {
      // The required-URL check reports this separately; keep aggregating errors.
    }
    const problem = validateCookieDomain(rawCookieDomain, backendHostname)
    if (problem) problems.push(`PAYLOAD_COOKIE_DOMAIN ${problem}`)
  }

  return problems
}

export function assertProductionConfig(): void {
  const problems = collectProductionConfigProblems()

  if (problems.length === 0) return

  throw new Error(
    `Refusing to boot with an invalid production configuration:\n` +
      problems.map((problem) => `  - ${problem}`).join('\n')
  )
}
