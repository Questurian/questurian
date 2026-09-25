import { APP_CONFIG } from './index'
import {
  HOST_ONLY_COOKIE_DOMAIN,
  readRequiredCookieHosts,
  registrableDomain,
  validateCookieDomain,
} from './session-cookie'
import { TRUSTED_PROXY_NAMES } from './trusted-proxy'
import { emailSenderProblems } from './email-sender'
import { isOriginAuthMode, MIN_ORIGIN_AUTH_SECRET_LENGTH, ORIGIN_AUTH_MODES } from '@/shared/http/origin-auth'
import { clientBaseUrl, revalidationDisconnected, revalidationSecret } from '@/features/public-revalidation/revalidation/env'
import { looksTransactionPooled } from '@/shared/database/pooled-uri'
import { describePoolBudget, poolBudget } from '@/shared/database/pool-budget'
import { fleetManifestProblems } from '@/shared/database/fleet-manifest'
import { loadTestConfigProblems } from '@/shared/http/load-identity'

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

const MIN_SECRET_LENGTH = 32

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

  // The visitor session cookie is set by the API host and read back on a
  // credentialed fetch from the site. It is `SameSite=Lax`, so the browser only
  // sends it when the two are the same site. Put the API on another registrable
  // domain (a `*.vercel.app` preview, say) and every reader is silently signed
  // out on every page, with nothing in the logs. Refuse that boot instead.
  try {
    const siteHost = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '').hostname
    const apiHost = new URL(process.env.BACKEND_URL_LOCAL ?? '').hostname
    if (!isLocalhost(`http://${siteHost}`) && registrableDomain(siteHost) !== registrableDomain(apiHost)) {
      problems.push(
        `NEXT_PUBLIC_APP_URL (${siteHost}) and BACKEND_URL_LOCAL (${apiHost}) are not the same site — ` +
          'the visitor session cookie would never be sent from the site to the API, so every reader ' +
          'would appear signed out. Serve both under one registrable domain.'
      )
    }
  } catch {
    // Missing or invalid URLs are reported by the required-URL check above.
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

  // Every limiter identifies its caller through `getClientIp`, which reads the
  // one header the configured proxy overwrites. Unset, it falls back to the
  // first entry of `X-Forwarded-For` — a list the caller may start, since
  // Cloudflare appends the real address rather than replacing what arrived.
  // That fallback is not a smaller limit, it is no limit: rotate the header and
  // every request is a new identity. Named here so a deployment must state what
  // it is behind, and so moving platforms cannot silently reinstate the bypass.
  if (!APP_CONFIG.trustedProxy.header) {
    const configured = APP_CONFIG.trustedProxy.name
    problems.push(
      configured
        ? `TRUSTED_PROXY is set to an unknown value — expected one of: ${TRUSTED_PROXY_NAMES.join(', ')}.`
        : 'TRUSTED_PROXY is not set — rate limiters would identify callers from a ' +
            `caller-writable header, which makes every limit bypassable. Expected one of: ${TRUSTED_PROXY_NAMES.join(', ')}.`
    )
  }

  // `PAYLOAD_SECRET` signs the staff session JWT *and* encrypts service-account
  // API keys, including the HMAC index they are looked up by. `BETTER_AUTH_SECRET`
  // carries every visitor session. Both are checked here because neither failure
  // is visible at boot: a missing value does not stop Payload or Better Auth from
  // starting, it just derives keys from whatever it was handed. The two are
  // checked separately on purpose — `better-auth.ts` falls back to
  // `PAYLOAD_SECRET` when `BETTER_AUTH_SECRET` is unset, which silently collapses
  // staff and visitor sessions onto one secret and makes either rotation break
  // both. Requiring the variable in its own right keeps that fallback a
  // development convenience.
  //
  // The 32-character floor is the repo's stated policy, not a cryptographic
  // boundary — Payload derives a fixed-size key from any non-empty string.
  // Diagnostics name the variable and nothing else: no value, no length, no
  // prefix, no hash. Boot errors reach logs and process supervisors.
  const requiredSecrets: Array<{ name: string; value: string | undefined; role: string }> = [
    {
      name: 'PAYLOAD_SECRET',
      value: process.env.PAYLOAD_SECRET,
      role: 'signs staff sessions and encrypts service-account API keys',
    },
    {
      name: 'BETTER_AUTH_SECRET',
      value: process.env.BETTER_AUTH_SECRET,
      role: 'signs visitor sessions',
    },
  ]

  for (const { name, value, role } of requiredSecrets) {
    const secret = value?.trim() ?? ''

    if (!secret) {
      problems.push(`${name} is not set — it ${role}.`)
      continue
    }

    if (secret.length < MIN_SECRET_LENGTH) {
      problems.push(
        `${name} is shorter than the ${MIN_SECRET_LENGTH}-character minimum — it ${role}. ` +
          'Rotating it invalidates the sessions it signs, so change it in a maintenance window.'
      )
    }
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
    // A cookie domain that only covers Payload's own host boots cleanly and
    // still reaches no sibling, so the hosts that need the session are named
    // explicitly and checked. Payload's own host is always one of them.
    const requiredHosts = readRequiredCookieHosts(process.env.PAYLOAD_COOKIE_REQUIRED_HOSTS)

    let backendHostname: string | undefined
    try {
      backendHostname = process.env.BACKEND_URL_LOCAL
        ? new URL(process.env.BACKEND_URL_LOCAL).hostname
        : undefined
    } catch {
      // The required-URL check reports this separately; keep aggregating errors.
    }

    if (requiredHosts.length === 0) {
      problems.push(
        'PAYLOAD_COOKIE_REQUIRED_HOSTS is not set — list every host that must ' +
          'receive the staff session (e.g. cms.questurian.com,www.questurian.com,' +
          'abw.questurian.com,abw-api.questurian.com) so a cookie domain that ' +
          'reaches none of them cannot boot.'
      )
    }

    const problem = validateCookieDomain(rawCookieDomain, [
      ...(backendHostname ? [backendHostname] : []),
      ...requiredHosts,
    ])
    if (problem) problems.push(`PAYLOAD_COOKIE_DOMAIN ${problem}`)
  }

  // Empty Stripe secrets do not fail the process: checkout still takes money
  // and `constructEvent` throws on every delivery, so nobody is ever marked a
  // member. Catch that at boot rather than as a silent provisioning outage.
  // Diagnostics name the variable and nothing else — no value, no prefix.
  if (!(process.env.STRIPE_SECRET_KEY?.trim())) {
    problems.push(
      'STRIPE_SECRET_KEY is not set — checkout and webhooks cannot talk to Stripe.'
    )
  }

  if (!(process.env.STRIPE_WEBHOOK_SECRET?.trim())) {
    problems.push(
      'STRIPE_WEBHOOK_SECRET is not set — the webhook route refuses every delivery ' +
        '(an empty key would verify signatures anyone can make), so paid visitors ' +
        'would never be marked members.'
    )
  }

  const monthlyPriceId =
    process.env.STRIPE_PRICE_ID_MONTHLY?.trim() || process.env.STRIPE_PRICE_ID?.trim() || ''
  if (!monthlyPriceId) {
    problems.push(
      'STRIPE_PRICE_ID (or STRIPE_PRICE_ID_MONTHLY) is not set — checkout would 400 at peak intent.'
    )
  }

  // Mail is how a reader gets back into their account. A missing Resend key
  // does not fail the boot, it fails the first password reset; a sender off
  // the site's domain sends nothing or lands in spam (`email-sender.ts`).
  for (const problem of emailSenderProblems({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  })) {
    problems.push(problem)
  }

  // Every public image address is built from this host
  // (`features/media/lib/bunny-public-url.ts`). Unset, each one becomes
  // `https:///media/<file>`, which a browser reads as a host named "media":
  // every photo on the site broken, and nothing fails. It is the pull zone
  // (questurian-cdn.b-cdn.net), not the storage API; `env:check` refuses that.
  if (!(process.env.BUNNY_STORAGE_HOSTNAME?.trim())) {
    problems.push(
      'BUNNY_STORAGE_HOSTNAME is not set — every image address is built from it, so every ' +
        'photo on the site would be broken. Set the Bunny pull zone host (e.g. questurian-cdn.b-cdn.net).'
    )
  }

  // Session-level advisory locks and transaction pooling are incompatible, and
  // the incompatibility is silent: `pg_advisory_lock` holds its lock for the
  // life of the session, and under PgBouncer transaction pooling a session is
  // whatever fragment of a connection one transaction gets. The lock that stops
  // two concurrent Stripe webhooks for one customer from both reading the same
  // before-state and both sending the same email would simply stop working.
  //
  // Checked at the URI rather than trusted to a code review at migration time,
  // because the change that breaks it is one environment variable and it is
  // the obvious thing to do when moving to a managed Postgres.
  if (looksTransactionPooled(APP_CONFIG.database.uri) && !APP_CONFIG.database.directUri.trim()) {
    problems.push(
      'DATABASE_URI looks transaction-pooled and DATABASE_URI_UNPOOLED is not set — ' +
        'session-level advisory locks do not survive transaction pooling, so payment ' +
        'coordination would silently stop working. Set the direct endpoint.'
    )
  }

  if (APP_CONFIG.database.directUri.trim() && looksTransactionPooled(APP_CONFIG.database.directUri)) {
    problems.push(
      'DATABASE_URI_UNPOOLED also looks transaction-pooled — advisory locks need a ' +
        'direct connection, not a second pooled one.'
    )
  }

  // Publishing is only durable if the thing it is durable *towards* exists.
  //
  // Delivery with no destination or no secret used to return quietly and the
  // worker marked the job done, so a deployment that lost one variable would
  // drain its queue clean while every public page stayed stale. That is now a
  // failure at delivery time, which makes it a retry loop rather than silent
  // data loss — and a retry loop is still an outage, so the variables are
  // required here where the boot can refuse instead.
  if (!clientBaseUrl()) {
    problems.push(
      'No frontend revalidation destination — set QUESTURA_CLIENT_URL (or NEXT_PUBLIC_FRONTEND_URL). ' +
        'Without it every publication would queue a refresh nobody can deliver.'
    )
  }

  if (!revalidationSecret()) {
    problems.push(
      'QUESTURA_REVALIDATION_SECRET is not set — the frontend would answer 401 to every refresh, ' +
        'so published changes would never reach readers.'
    )
  }

  if (revalidationDisconnected()) {
    problems.push(
      'REFRESH_DISCONNECTED is set — that is a development convenience that reports every refresh as ' +
        'skipped. In production it means publishing silently does nothing.'
    )
  }

  // `REFRESH_OUTBOX=off` looks like a safe revert to the previous behaviour.
  // It is not: it returns publishing to inline best-effort work that runs
  // inside the save's transaction, can read uncommitted content, and loses
  // the refresh entirely on any failure with nothing recorded to repair. It
  // is an emergency mode with known data loss, so it has to be acknowledged
  // by name rather than reached by flipping one variable.
  if (process.env.REFRESH_OUTBOX === 'off' && !process.env.REFRESH_OUTBOX_DEGRADED_ACK?.trim()) {
    problems.push(
      'REFRESH_OUTBOX=off is a degraded emergency mode, not a rollback: refreshes become inline and ' +
        'best-effort, and a failed one is lost with nothing recorded to repair it. Set ' +
        'REFRESH_OUTBOX_DEGRADED_ACK to the reason and the date if that is really intended, and ' +
        'rebuild the search index and purge the CDN afterwards.'
    )
  }

  // Optional, but a short render token is a guessable bypass of the per-IP
  // public read limits (public-read-rate-limit.ts).
  const renderToken = process.env.QUESTURA_RENDER_TOKEN?.trim()
  if (renderToken && renderToken.length < 32) {
    problems.push('QUESTURA_RENDER_TOKEN is shorter than 32 characters.')
  }

  // The load identity (decision D3, `shared/http/load-identity.ts`): off
  // unless set, 32+ characters, and only for one window that ends soon.
  problems.push(...loadTestConfigProblems())

  // The front door (ADR-0016, `shared/http/origin-auth.ts`). Optional here:
  // the laptop's origin is reachable only through its own tunnel, so it runs
  // without one. `env:check` requires it for Railway, where the origin is
  // reachable by anyone. A short one is a guessable key to the origin; a mode
  // with no secret, or a misspelt mode, is a lock somebody believes is on.
  const originSecret = process.env.ORIGIN_AUTH_SECRET?.trim()
  const originMode = process.env.ORIGIN_AUTH_MODE?.trim().toLowerCase()
  if (originSecret && originSecret.length < MIN_ORIGIN_AUTH_SECRET_LENGTH) {
    problems.push(`ORIGIN_AUTH_SECRET is shorter than ${MIN_ORIGIN_AUTH_SECRET_LENGTH} characters.`)
  }
  if (originMode && !isOriginAuthMode(originMode)) {
    problems.push(`ORIGIN_AUTH_MODE is set to an unknown value — expected one of: ${ORIGIN_AUTH_MODES.join(', ')}.`)
  }
  if (originMode && !originSecret) {
    problems.push('ORIGIN_AUTH_MODE is set but ORIGIN_AUTH_SECRET is not, so the origin lock is off.')
  }

  // Pool maxima are per process, autoscaling multiplies them, a rolling deploy
  // runs two generations at once and a scheduled job is a whole process.
  // Postgres does not care which pool exhausts it: the first symptom is
  // `FATAL: sorry, too many clients already` on whichever pool asks next. So
  // production states every number the answer depends on, and the answer has
  // to fit.
  // What the deployment claims about itself, checked for the ways a claim can
  // be true and useless: containers counted as processes, a rollout assumed
  // homogeneous, a pooler on an unrecognised hostname, a gate setting that is
  // configured and means "no gate". See shared/database/fleet-manifest.ts.
  for (const problem of fleetManifestProblems()) {
    problems.push(`Fleet manifest: ${problem}`)
  }

  const budget = poolBudget()
  for (const problem of budget.problems) {
    problems.push(`Connection budget: ${problem}`)
  }
  if (budget.exceedsAllowance) {
    problems.push(
      `Configured connection pools exceed the database allowance: ${describePoolBudget(budget)}.`
    )
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
