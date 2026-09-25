/**
 * The one redaction pass every log line and every error report goes through.
 *
 * Before this, redaction was left to each call site, which means it was left
 * to memory: a `logger.error('...', { headers })` somewhere would have written
 * a visitor's session cookie into Railway's logs, and an error report would
 * have shipped it to a third party. Now the logger and the Sentry `beforeSend`
 * both call `redact`, so a call site cannot forget.
 *
 * Two rules:
 *
 * - **By name.** A value under a key that names a secret (`cookie`,
 *   `authorization`, `stripe-signature`, `password`, `token`, `secret`, an API
 *   key, an email field) is replaced whole, whatever it looks like.
 * - **By shape.** Inside any string, anything that looks like an email
 *   address, a bearer token, a Stripe key or signing secret, a Resend key, or
 *   credentials in a URL is replaced in place. Error messages are where these
 *   leak from most, and an error message has no key to go by.
 * - **By value.** The origin secret (`ORIGIN_AUTH_SECRET`, ADR-0016) has no
 *   shape to match, so the configured value itself is removed wherever it
 *   appears. `proxy.ts` strips the header before any route runs; this is the
 *   second lock, for a copy that escapes that some other way.
 *
 * It errs towards removing too much. A log line with `[redacted]` in it costs
 * a second look; a log line with a session token in it costs a rotation and a
 * disclosure.
 */

export const REDACTED = '[redacted]'
export const REDACTED_EMAIL = '[email]'

/**
 * Keys whose values are removed whole. Matched case-insensitively against the
 * key with `-` and `_` removed, so `Set-Cookie`, `set_cookie` and `setCookie`
 * are one rule.
 */
const SENSITIVE_KEY =
  /^(cookie|cookies|setcookie|authorization|proxyauthorization|stripesignature|xapikey|apikey|password|currentpassword|newpassword|passwordhash|salt|token|accesstoken|refreshtoken|idtoken|sessiontoken|session|secret|clientsecret|email|emailaddress|useremail|ipaddress|ip)$|token$|secret$|password$|apikey$|cookie$|originauth$/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.replace(/[-_\s]/g, ''))
}

const STRING_RULES: Array<[RegExp, string]> = [
  // Credentials inside a URL: scheme://user:pass@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(:[^\s/@]*)?@/gi, `$1${REDACTED}@`],
  // Email addresses.
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED_EMAIL],
  // Authorization header values written into a message.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${REDACTED}`],
  // Stripe secret, restricted and publishable keys, and webhook signing secrets.
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/g, REDACTED],
  [/\bwhsec_[A-Za-z0-9]{8,}/g, REDACTED],
  // A Stripe-Signature header value: t=...,v1=...
  [/\bt=\d{9,},v1=[a-f0-9]{16,}[^\s]*/gi, REDACTED],
  // Resend API keys.
  [/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/g, REDACTED],
  // Cookie pairs for the session cookies this app sets.
  [/\b((?:__Secure-)?(?:better-auth|payload-token|questura)[A-Za-z0-9._-]*)=[^;\s]+/g, `$1=${REDACTED}`],
  // The origin-lock header written into a message, whatever its value.
  [/\b(x-questura-origin-auth["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi, `$1${REDACTED}`],
]

/** Shorter than this is not the origin secret (boot requires 32); never match a stray short value. */
const MIN_VALUE_RULE_LENGTH = 16

export function redactString(value: string): string {
  let out = value
  for (const [pattern, replacement] of STRING_RULES) out = out.replace(pattern, replacement)
  const originSecret = process.env.ORIGIN_AUTH_SECRET?.trim()
  if (originSecret && originSecret.length >= MIN_VALUE_RULE_LENGTH && out.includes(originSecret)) {
    out = out.split(originSecret).join(REDACTED)
  }
  return out
}

const MAX_DEPTH = 8

/**
 * A redacted deep copy. Never mutates its input: the object handed to a logger
 * is often the caller's live request or error.
 *
 * `Error`s become plain `{ name, message, stack }` objects with each field
 * redacted, because `JSON.stringify` of an `Error` is `{}` and that is how an
 * error log line ends up saying nothing.
 */
export function redact<T>(value: T): T {
  return redactValue(value, 0, new WeakSet()) as T
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name,
      message: redactString(value.message),
    }
    if (value.stack) out.stack = redactString(value.stack)
    const digest = (value as Error & { digest?: unknown }).digest
    if (typeof digest === 'string') out.digest = digest
    if (value.cause !== undefined) out.cause = redactValue(value.cause, depth + 1, seen)
    return out
  }

  if (value instanceof Date) return value

  if (typeof Headers !== 'undefined' && value instanceof Headers) {
    const out: Record<string, string> = {}
    value.forEach((headerValue, key) => {
      out[key] = isSensitiveKey(key) ? REDACTED : redactString(headerValue)
    })
    return out
  }

  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, seen))

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    // Booleans and numbers under a sensitive name (`hasSecret: true`,
    // `tokenCount: 3`) say nothing secret and are worth keeping.
    const carriesText = typeof child === 'string' || (typeof child === 'object' && child !== null)
    out[key] = isSensitiveKey(key) && carriesText ? REDACTED : redactValue(child, depth + 1, seen)
  }
  return out
}
