/**
 * Which proxy stands in front of this deployment, and therefore which header
 * carries a client address worth believing.
 *
 * Why this is configuration and not detection
 * -------------------------------------------
 * A header is not trustworthy because of its name. It is trustworthy because
 * the proxy in front overwrites it, discarding whatever the caller claimed.
 * `CF-Connecting-IP` is authoritative behind Cloudflare and worthless anywhere
 * else, where nobody is stripping it and a caller can simply set it.
 *
 * That is why this is a lookup with exactly one live answer rather than a list
 * of candidates to try. Reading "whichever of these headers is present" would
 * be strictly worse than reading none of them: an attacker just sends the first
 * name on the list. The chain would be the vulnerability.
 *
 * What this replaces
 * ------------------
 * The first entry of `X-Forwarded-For`. That header is a list the caller may
 * start: Cloudflare *appends* the real address to whatever arrived, so the
 * first entry is written by the very person being rate limited. Verified
 * against the live tunnel on 2026-08-15 — a request carrying a forged
 * `X-Forwarded-For` produced a rate-limit bucket under the forged address, so
 * every limiter in the app could be bypassed by rotating one header.
 *
 * Adding a platform
 * -----------------
 * Confirm against that platform's own documentation that it overwrites the
 * header for inbound requests, and that the value is a single address rather
 * than a list. Do not add a name on the strength of this file.
 *
 * The remaining assumption
 * ------------------------
 * The proxy must be the only route in. These headers say nothing about a caller
 * who reaches the origin directly, so the origin must not be publicly
 * reachable — today it listens on localhost and only `cloudflared` can reach
 * it.
 */

export const TRUSTED_PROXY_HEADERS = {
  cloudflare: 'cf-connecting-ip',
  vercel: 'x-vercel-forwarded-for',
  netlify: 'x-nf-client-connection-ip',
  fly: 'fly-client-ip',
} as const

export type TrustedProxyName = keyof typeof TRUSTED_PROXY_HEADERS

export const TRUSTED_PROXY_NAMES = Object.keys(TRUSTED_PROXY_HEADERS) as TrustedProxyName[]

/**
 * The header to read, or `null` when the deployment has not said what it is
 * behind. Production refuses to boot on `null` (`assertProductionConfig`);
 * development falls back to `X-Forwarded-For`, where there is usually no proxy
 * and nothing to spoof past.
 */
export function resolveTrustedProxyHeader(configured: string | undefined): string | null {
  const name = configured?.trim().toLowerCase()
  if (!name) return null

  return TRUSTED_PROXY_HEADERS[name as TrustedProxyName] ?? null
}
