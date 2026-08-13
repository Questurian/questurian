/**
 * Scope of the Payload `Users` session cookie (`payload-token`).
 *
 * Payload's defaults are `sameSite: 'Lax'`, `secure: false` and no `Domain`
 * (`addDefaultsToAuthConfig`, payload/dist/collections/config/defaults.js). A
 * host-only cookie is correct only while every caller shares Payload's host.
 *
 * It does not survive the deployment this repo is heading for, where Payload is
 * `cms.questurian.com` and the AI Blog Writer is `abw.questurian.com` with its
 * FastAPI backend on `abw-api.questurian.com`. A host-only cookie is never sent
 * to those hosts, so Staff auth there fails as an unexplained 401.
 *
 * Sibling subdomains of one registrable domain are *same-site*, so `Lax` keeps
 * working and no third-party cookie is involved — but only once `Domain` is
 * widened to that registrable domain.
 *
 * The widening is deliberate and not free: a cookie scoped to `questurian.com`
 * is attached to requests for every host under it, including the public client
 * frontend, which has no use for it. `httpOnly` prevents browser JavaScript
 * from reading it, but every receiving server can read it and sibling hosts can
 * overwrite a parent-domain cookie. Every host under this boundary must
 * therefore be operated as trusted infrastructure. Payload's `csrf` allowlist
 * separately decides which browser origins may use the cookie against Payload;
 * it does not remove the wider server-side trust boundary.
 *
 * Ports do not scope cookies. Local development stays host-only and still works
 * across `localhost:4000`, `localhost:5173` and `localhost:8000`.
 */

/**
 * Says "this deployment really is host-only" out loud, so an unset variable and
 * a deliberate same-origin deployment are distinguishable at boot. Mirrors
 * `ABW_ALLOWED_ORIGINS=none` in the AI Blog Writer backend.
 */
export const HOST_ONLY_COOKIE_DOMAIN = 'host-only'

export type SessionCookieConfig = {
  domain?: string
  sameSite: 'Lax' | 'None' | 'Strict'
  secure: boolean
}

/**
 * Browsers refuse a `Domain` that is a public suffix (RFC 6265 §5.3 step 5),
 * because it would hand one tenant's cookie to every other tenant. The full
 * Public Suffix List is a dependency and a moving target; this covers the
 * multi-label suffixes this project can plausibly be deployed behind, where the
 * mistake is easy to make and its symptom — a cookie the browser silently drops
 * — is indistinguishable from the 401 this module exists to prevent. A
 * single-label suffix like `com` is already rejected as a single-label host.
 */
const SHARED_PUBLIC_SUFFIXES = new Set([
  'trycloudflare.com',
  'cfargotunnel.com',
  'pages.dev',
  'workers.dev',
  'vercel.app',
  'netlify.app',
  'github.io',
  'herokuapp.com',
  'ngrok.io',
  'ngrok-free.app',
  'co.uk',
  'com.au',
  'com.br',
])

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

/**
 * RFC 6265 §5.1.3 domain-matching: a cookie scoped to `questurian.com` is sent
 * to `questurian.com` and to anything under it, and to nothing else.
 */
function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/**
 * A `Domain` attribute is a bare host: no scheme, no port, no path. A leading
 * dot is legal and ignored (RFC 6265 §5.2.3), so both `questurian.com` and
 * `.questurian.com` are accepted and mean the same thing.
 *
 * The dot requirement rejects `localhost` and other single-label hosts, which
 * browsers refuse as a cookie `Domain` anyway — better to fail at boot than to
 * ship a cookie no browser will store.
 *
 * `requiredHostnames` are the hosts this deployment expects to receive the
 * staff cookie: Payload's own host plus the operator hosts named by
 * `PAYLOAD_COOKIE_REQUIRED_HOSTS`. Checking only Payload's host is not enough —
 * `Domain=cms.questurian.com` on a Payload served from `cms.questurian.com` is
 * self-consistent and still reaches no sibling, which is exactly the silent 401
 * this variable exists to prevent. The list is deliberately its own variable
 * rather than `CORS_ORIGINS`: an allowed browser origin (a preview deployment,
 * a partner site) is not necessarily a host that should hold a staff session,
 * and no `Domain` can span two registrable domains, so deriving the list from
 * CORS would make a legitimate origin unbootable.
 */
export function validateCookieDomain(
  domain: string,
  requiredHostnames: readonly string[] = []
): string | null {
  if (domain.includes('://')) return `must be a bare host, not a URL (${domain}).`
  if (domain.includes('/')) return `must not contain a path (${domain}).`
  if (domain.includes(':')) return `must not contain a port (${domain}).`

  const withoutLeadingDot = domain.replace(/^\./, '')

  if (!withoutLeadingDot.includes('.')) {
    return `must be a multi-label host; browsers reject single-label domains (${domain}).`
  }

  if (/^\d+(\.\d+)*$/.test(withoutLeadingDot)) {
    return `must be a domain name, not an IP address (${domain}).`
  }

  if (
    withoutLeadingDot.length > 253 ||
    withoutLeadingDot
      .split('.')
      .some(
        (label) =>
          label.length === 0 ||
          label.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
      )
  ) {
    return `must contain valid hostname labels (${domain}).`
  }

  const normalizedDomain = normalizeHost(withoutLeadingDot)

  if (SHARED_PUBLIC_SUFFIXES.has(normalizedDomain)) {
    return `is a shared public suffix; browsers refuse to store a cookie scoped to it (${domain}).`
  }

  const uncovered = Array.from(
    new Set(requiredHostnames.map(normalizeHost).filter(Boolean))
  ).filter((host) => !domainMatches(host, normalizedDomain))

  if (uncovered.length > 0) {
    return (
      `is not sent to every host that needs the staff session ` +
      `(${uncovered.join(', ')}); those hosts would see no cookie and answer 401.`
    )
  }

  return null
}

/**
 * The operator hosts that must receive the staff session, as a comma-separated
 * list of bare hostnames. Stated explicitly because Payload cannot infer them:
 * `abw-api.questurian.com` reads `payload-token` server-side and never appears
 * as a browser origin anywhere in this app's configuration.
 */
export function readRequiredCookieHosts(raw: string | undefined): string[] {
  return Array.from(
    new Set(
      (raw ?? '')
        .split(',')
        .map((host) => normalizeHost(host))
        .filter(Boolean)
    )
  )
}

export function readCookieDomain(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  if (trimmed.toLowerCase() === HOST_ONLY_COOKIE_DOMAIN) return undefined
  return trimmed
}

export function resolveSessionCookieConfig({
  isProduction,
  domain,
}: {
  isProduction: boolean
  domain: string | undefined
}): SessionCookieConfig {
  return {
    // Left explicit rather than inherited. `Lax` is the whole reason the
    // subdomain layout works, so a change to Payload's default must not
    // silently become a change to this app's CSRF posture.
    sameSite: 'Lax',
    // Production terminates TLS at Cloudflare, so `Secure` is always correct
    // there. Development is plain http on localhost, where `Secure` would stop
    // the cookie being stored at all.
    secure: isProduction,
    ...(domain ? { domain } : {}),
  }
}
