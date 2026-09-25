import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The load identity: how one load generator stands for many readers, for one
 * approved test window only (launch fix plan item 9, decision D3).
 *
 * Why it exists
 * -------------
 * Behind Cloudflare, `CF-Connecting-IP` is the generator's real address,
 * whatever k6 writes into it. A whole load test is then one caller, and the
 * per-address limits (public reads 60–240/min, member bodies 30/min, plans
 * 30/min) refuse it long before the platform is busy. The result says nothing
 * about capacity, and it tempts someone to raise the limits for everyone.
 *
 * What it is
 * ----------
 * With `LOAD_TEST_KEY` set, a request carrying
 *
 *     X-Questura-Load-Identity: <address>;<HMAC-SHA256(key, address), hex>
 *
 * is counted by every limiter as `<address>` instead of the proxy's address
 * (`getClientIp`). Nothing else changes: the admission gates, the pools, the
 * per-session and per-account limits apply exactly as to anyone else.
 *
 * The guard rails, each enforced here or at boot, not by habit:
 *
 *  - **Off by default.** Unset key: the header is ignored, silently, so it
 *    is not even a way to write to the logs.
 *  - **32+ characters.** Production refuses to boot on a shorter key
 *    (`loadTestConfigProblems`, via `assertProductionConfig`).
 *  - **Only during the test window.** `LOAD_TEST_UNTIL` (an ISO time) is
 *    required with the key, may be at most `MAX_LOAD_TEST_WINDOW_MS` after
 *    boot, and after it passes the key stops working even if nobody removes
 *    it.
 *  - **Every use is logged.** `proxy.ts` writes one line per request that
 *    carries the header while the key is set: accepted, or refused and why.
 *  - **`launch:verify` fails while it is set.** `/api/health/ready` reports
 *    `loadIdentity` as `off`, `on`, `expired` or `invalid`; anything but
 *    `off` is a failed launch check.
 *
 * And one more, so the bypass cannot reach a real reader: the only addresses
 * it can claim are the RFC 2544 benchmarking range, `198.18.0.0/15`. A signed
 * header naming any other address is refused. No real caller has one, so a
 * load test can never spend, or share, a reader's budget.
 */

export const LOAD_IDENTITY_HEADER = 'x-questura-load-identity'
export const MIN_LOAD_TEST_KEY_LENGTH = 32
/** The longest test window the server accepts, measured from boot. */
export const MAX_LOAD_TEST_WINDOW_MS = 12 * 60 * 60 * 1000

export type LoadTestConfig =
  | { state: 'off' }
  | { state: 'on'; key: string; until: number }
  | { state: 'invalid'; problem: string }

type Env = Record<string, string | undefined>

/** The key and window as configured. `invalid` is never honoured. */
export function readLoadTestConfig(env: Env = process.env): LoadTestConfig {
  const key = env.LOAD_TEST_KEY?.trim() ?? ''
  const rawUntil = env.LOAD_TEST_UNTIL?.trim() ?? ''
  if (!key) {
    return rawUntil
      ? { state: 'invalid', problem: 'LOAD_TEST_UNTIL is set without LOAD_TEST_KEY. Remove it: the test window is over.' }
      : { state: 'off' }
  }
  if (key.length < MIN_LOAD_TEST_KEY_LENGTH) {
    return { state: 'invalid', problem: `LOAD_TEST_KEY is shorter than ${MIN_LOAD_TEST_KEY_LENGTH} characters.` }
  }
  const until = Date.parse(rawUntil)
  if (!rawUntil || !Number.isFinite(until)) {
    return {
      state: 'invalid',
      problem: 'LOAD_TEST_KEY needs LOAD_TEST_UNTIL, the ISO time the test window ends (e.g. 2026-10-01T18:00:00Z).',
    }
  }
  return { state: 'on', key, until }
}

/**
 * What production refuses to boot on. An expired window is not one of them:
 * a restart after the window must still boot, and `launch:verify` reports the
 * forgotten key instead.
 */
export function loadTestConfigProblems(env: Env = process.env, now: number = Date.now()): string[] {
  const config = readLoadTestConfig(env)
  if (config.state === 'invalid') return [config.problem]
  if (config.state === 'on' && config.until - now > MAX_LOAD_TEST_WINDOW_MS) {
    return [
      `LOAD_TEST_UNTIL is more than ${MAX_LOAD_TEST_WINDOW_MS / 3_600_000} hours away. ` +
        'The load identity is for one approved test window; set the end of that window.',
    ]
  }
  return []
}

export type LoadIdentityState = 'off' | 'on' | 'expired' | 'invalid'

/** For `/api/health/ready`: whether a load-test key is set, and whether it still works. */
export function loadIdentityState(env: Env = process.env, now: number = Date.now()): LoadIdentityState {
  const config = readLoadTestConfig(env)
  if (config.state !== 'on') return config.state
  return now < config.until ? 'on' : 'expired'
}

export function signLoadIdentity(key: string, address: string): string {
  return createHmac('sha256', key).update(address).digest('hex')
}

/** `198.18.0.0/15`, RFC 2544: reserved for benchmarking, never a real caller. */
export function isBenchmarkAddress(value: string): boolean {
  const match = /^198\.(18|19)\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (!match) return false
  return [match[2], match[3]].every((octet) => /^(?:0|[1-9]\d*)$/.test(octet!) && Number(octet) <= 255)
}

export type LoadIdentityVerdict =
  | { kind: 'absent' }
  | { kind: 'ignored' }
  | { kind: 'accepted'; address: string }
  | { kind: 'refused'; reason: string }

/**
 * What a request's load-identity header means under `config` at `now`.
 *
 * `ignored`: the key is not set (or not valid), so the header means nothing
 * and is not worth a log line. `refused`: the key is set and this header does
 * not qualify; the request is counted by its real address.
 */
export function loadIdentityVerdict(headers: Headers, config: LoadTestConfig, now: number): LoadIdentityVerdict {
  const raw = headers.get(LOAD_IDENTITY_HEADER)
  if (raw === null) return { kind: 'absent' }
  if (config.state !== 'on') return { kind: 'ignored' }
  if (now >= config.until) return { kind: 'refused', reason: 'the test window is over (LOAD_TEST_UNTIL)' }

  const separator = raw.indexOf(';')
  const address = (separator < 0 ? '' : raw.slice(0, separator)).trim()
  const signature = (separator < 0 ? '' : raw.slice(separator + 1)).trim().toLowerCase()
  if (!isBenchmarkAddress(address)) return { kind: 'refused', reason: 'not an address in 198.18.0.0/15' }
  if (!/^[0-9a-f]{64}$/.test(signature)) return { kind: 'refused', reason: 'malformed signature' }

  const expected = Buffer.from(signLoadIdentity(config.key, address), 'hex')
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return { kind: 'refused', reason: 'wrong signature' }
  return { kind: 'accepted', address }
}

/**
 * The address a limiter should count this request as, when it carries a
 * valid load identity; otherwise `null` and the caller reads the proxy's
 * header as always. Silent: `proxy.ts` logs each use once per request.
 */
export function loadIdentityAddress(headers: Headers, env: Env = process.env, now: number = Date.now()): string | null {
  if (!headers.has(LOAD_IDENTITY_HEADER)) return null
  const verdict = loadIdentityVerdict(headers, readLoadTestConfig(env), now)
  return verdict.kind === 'accepted' ? verdict.address : null
}
