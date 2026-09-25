import { createHash, timingSafeEqual } from 'node:crypto'

import { TRUSTED_PROXY_HEADERS } from '@/shared/config/trusted-proxy'

/**
 * The in-app half of the API front door (ADR-0016 option A).
 *
 * On Railway the API is reachable at Railway's edge by anyone who names its
 * host, so the proxy header every limiter believes (`CF-Connecting-IP`) can
 * be forged by skipping Cloudflare. The lock is a shared secret:
 *
 *  - a Cloudflare Transform Rule sets `X-Questura-Origin-Auth: <secret>` on
 *    every request it forwards to the API host;
 *  - a Railway edge rule allows only requests that carry it;
 *  - and this module, run by `proxy.ts` on every request, checks it again,
 *    so the lock does not depend on a dashboard rule staying put.
 *
 * Everything that reaches the API from outside comes through Cloudflare and
 * therefore carries the header: readers' browsers, the site's own renders
 * (which also send it themselves from a Worker secret, because whether a
 * Transform Rule applies to a Worker's subrequests is a platform unknown),
 * Stripe's webhook deliveries, Google's sign-in redirect, the writer pipeline
 * and Location Manager, and schedulers calling the public host. None of them
 * is exempt, because an exemption here would be a path the edge rule blocks
 * anyway. The only exemption is the health pair: Railway's healthcheck calls
 * `/api/health/ready` on the container directly, from inside Railway, with
 * no header, and a liveness probe says nothing about any caller.
 *
 * With `ORIGIN_AUTH_SECRET` unset the lock is off, which is what development,
 * CI and the laptop's soft-prod (reachable only through its own tunnel) run.
 * `env:check` refuses a Railway variable file without it.
 */

export const ORIGIN_AUTH_HEADER = 'x-questura-origin-auth'
export const MIN_ORIGIN_AUTH_SECRET_LENGTH = 32

/** Exact paths answered without the header. Nothing else, no prefixes. */
export const ORIGIN_AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/api/health', '/api/health/ready'])

/**
 * What a request without the right header gets.
 *
 * - `refuse` (default): 403, `no-store`. The API is not served to it at all.
 * - `unidentified`: served, but every address header is removed first, so
 *   every limiter counts it in the one shared bucket (`UNIDENTIFIED_CLIENT`)
 *   and a forged `CF-Connecting-IP` buys nothing. For a platform where the
 *   refusal itself would cost more than it saves.
 */
export const ORIGIN_AUTH_MODES = ['refuse', 'unidentified'] as const
export type OriginAuthMode = (typeof ORIGIN_AUTH_MODES)[number]

export type OriginAuthConfig = { secret: string | null; mode: OriginAuthMode }

type Env = Record<string, string | undefined>

export function isOriginAuthMode(value: string): value is OriginAuthMode {
  return (ORIGIN_AUTH_MODES as readonly string[]).includes(value)
}

/**
 * Read at call time, not at import: the proxy runs this per request and the
 * cost is two property reads. An unknown mode falls back to `refuse`, the
 * stricter one; production refuses to boot on it anyway.
 */
export function readOriginAuthConfig(env: Env = process.env): OriginAuthConfig {
  const secret = env.ORIGIN_AUTH_SECRET?.trim() || null
  const mode = env.ORIGIN_AUTH_MODE?.trim().toLowerCase() ?? ''
  return { secret, mode: isOriginAuthMode(mode) ? mode : 'refuse' }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/**
 * Constant-time comparison. Both sides are hashed first so the buffers are
 * always the same length: `timingSafeEqual` throws on a length mismatch, and
 * an early length check would itself tell a prober how long the secret is.
 */
export function originSecretMatches(provided: string | null | undefined, secret: string): boolean {
  if (!provided) return false
  return timingSafeEqual(digest(provided.trim()), digest(secret))
}

export type OriginAuthVerdict = 'off' | 'exempt' | 'trusted' | 'missing' | 'wrong'

export function originAuthVerdict(headers: Headers, pathname: string, config: OriginAuthConfig): OriginAuthVerdict {
  if (!config.secret) return 'off'
  if (ORIGIN_AUTH_EXEMPT_PATHS.has(pathname)) return 'exempt'
  const provided = headers.get(ORIGIN_AUTH_HEADER)
  if (!provided) return 'missing'
  return originSecretMatches(provided, config.secret) ? 'trusted' : 'wrong'
}

/**
 * Every header any code path reads a caller's address from: each trusted
 * proxy's, plus the development fallbacks in `getClientIp`. Removing all of
 * them makes `getClientIp` answer `UNIDENTIFIED_CLIENT` whatever
 * `TRUSTED_PROXY` says.
 */
export const CLIENT_ADDRESS_HEADERS: readonly string[] = [
  ...Object.values(TRUSTED_PROXY_HEADERS),
  'x-forwarded-for',
  'x-real-ip',
]
