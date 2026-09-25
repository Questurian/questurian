/**
 * Command-line options for `launch:verify`, parsed without side effects so
 * the rules about which checks may be left out are unit-tested
 * (`options.test.ts`, launch fix plan item 6).
 *
 * The rule: against the real site, every check runs. Leaving out `--bypass`,
 * `--rate-limit-probe` or the front-door target used to drop those checks
 * from an all-green summary without a word. They are now required, and the
 * only way to run without them is `--local`, which is refused for any host
 * that is not this machine.
 */
import { isIP } from 'node:net'

import type { Target } from './checks'

export type ParsedOptions = { target: Target; json: boolean; local: boolean } | { error: string }

export const USAGE =
  'usage: pnpm launch:verify -- --client <site origin> --api <api origin> ' +
  '--bypass <origin> --edge-ip <ip> (or --origin-edge <origin>) --rate-limit-probe ' +
  '[--local] [--allow-http] [--no-image-check] [--json]'

/** Names a signed-in session cookie can arrive under (production uses the `__Secure-` form). */
const SESSION_COOKIE_NAMES = ['__Secure-questura_visitor.session_token', 'questura_visitor.session_token']
const DEFAULT_SESSION_COOKIE = SESSION_COOKIE_NAMES[0]!

/** Hosts that can only be this machine: the readiness sandbox and nothing else. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
}

/**
 * `--edge-ip 203.0.113.9` (or `127.0.0.1:4110`, `[2001:db8::1]:443`) as the
 * origin the front-door probe connects to. It takes the API's scheme: the
 * probe presents the API's host name to that address (Host and TLS SNI), so
 * the scheme has to be the one the API is served on.
 */
export function edgeOriginFromIp(value: string, apiOrigin: string): string | { error: string } {
  const trimmed = value.trim()
  let host = trimmed
  let port = ''
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(trimmed)
  if (bracketed) {
    host = bracketed[1]!
    port = bracketed[2] ?? ''
  } else if (isIP(trimmed) !== 6) {
    const withPort = /^([^:]+):(\d+)$/.exec(trimmed)
    if (withPort) {
      host = withPort[1]!
      port = withPort[2]!
    }
  }
  const family = isIP(host)
  if (family === 0) return { error: `--edge-ip wants an IP address (optionally :port), not "${value}". Resolve the target first: dig +short <target>` }
  const scheme = new URL(apiOrigin).protocol
  return `${scheme}//${family === 6 ? `[${host}]` : host}${port ? `:${port}` : ''}`
}

/**
 * The session cookie from `LAUNCH_VERIFY_COOKIE`, as a Cookie header holding
 * that cookie alone. Accepts the bare value (as DevTools shows it), one
 * `name=value` pair, or a whole Cookie header; only the session token is
 * kept, so the 5-minute cache cookie is never sent and the server has to
 * issue a fresh one, which is how the check sees the attributes.
 */
export function sessionCookieHeader(raw: string): string | { error: string } {
  const value = raw.trim()
  if (!value) return { error: 'LAUNCH_VERIFY_COOKIE is empty' }
  if (!value.includes('=')) return `${DEFAULT_SESSION_COOKIE}=${value}`
  for (const part of value.split(';')) {
    const at = part.indexOf('=')
    if (at < 0) continue
    const name = part.slice(0, at).trim()
    if (SESSION_COOKIE_NAMES.includes(name)) return `${name}=${part.slice(at + 1).trim()}`
  }
  // A bare signed token contains '=' (base64 padding) but no cookie name.
  if (/^[A-Za-z0-9._%+/-]+=+$/.test(value)) {
    return `${DEFAULT_SESSION_COOKIE}=${value}`
  }
  return { error: `LAUNCH_VERIFY_COOKIE has no ${SESSION_COOKIE_NAMES.join(' or ')} cookie` }
}

export function parseOptions(argv: string[], env: Record<string, string | undefined>): ParsedOptions {
  const arg = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const flag = (name: string): boolean => argv.includes(`--${name}`)
  const origin = (name: string) => arg(name)?.replace(/\/$/, '')

  const client = origin('client')
  const api = origin('api')
  if (!client || !api) return { error: USAGE }

  const local = flag('local')
  if (local) {
    const remote = [client, api].filter((value) => !isLocalHost(new URL(value).hostname))
    if (remote.length > 0) return { error: `--local is for the readiness sandbox only; refused for ${remote.join(' and ')}` }
  }

  const edgeIp = arg('edge-ip')
  const originEdgeArg = origin('origin-edge')
  if (edgeIp && originEdgeArg) return { error: '--edge-ip and --origin-edge name the same probe target; give one' }
  let originEdge = originEdgeArg
  if (edgeIp) {
    const resolved = edgeOriginFromIp(edgeIp, api)
    if (typeof resolved !== 'string') return resolved
    originEdge = resolved
  }

  const bypassOrigin = origin('bypass')
  const rateLimitProbe = flag('rate-limit-probe')
  if (!local) {
    const missing = [
      bypassOrigin ? null : '--bypass <the *.up.railway.app origin>',
      originEdge ? null : "--edge-ip <Railway's edge address> (or --origin-edge <origin>)",
      rateLimitProbe ? null : '--rate-limit-probe',
    ].filter(Boolean)
    if (missing.length > 0) {
      return {
        error:
          `missing ${missing.join(', ')}. Against the real site every check runs; ` +
          'leaving one out would drop it from an all-green result. (--local is for the readiness sandbox only.)',
      }
    }
  }

  let cookie: Target['cookie']
  const rawCookie = env.LAUNCH_VERIFY_COOKIE
  if (rawCookie !== undefined) {
    const header = sessionCookieHeader(rawCookie)
    if (typeof header !== 'string') return header
    const member = (env.LAUNCH_VERIFY_COOKIE_MEMBER ?? '').trim().toLowerCase()
    if (!['yes', 'no'].includes(member)) {
      return { error: 'LAUNCH_VERIFY_COOKIE needs LAUNCH_VERIFY_COOKIE_MEMBER=yes or no: whether that account is a member right now' }
    }
    cookie = { header, member: member === 'yes' }
  }

  return {
    local,
    json: flag('json'),
    target: {
      client,
      api,
      bypassOrigin,
      originEdge,
      expectPrices: {
        monthly: Number(arg('monthly-cents') ?? 1299),
        yearly: Number(arg('yearly-cents') ?? 7999),
      },
      allowHttp: flag('allow-http'),
      rateLimitProbe,
      homePath: arg('home'),
      articlePath: arg('article'),
      authorPath: arg('author'),
      imageCheck: !flag('no-image-check'),
      cookie,
    },
  }
}
