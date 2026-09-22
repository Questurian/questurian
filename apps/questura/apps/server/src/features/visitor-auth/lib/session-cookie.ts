/**
 * The visitor session cookie, found by name.
 *
 * Routes used to decide "signed in, do the expensive thing" by testing the
 * whole Cookie header against `/questura_visitor/`. Any cookie whose *text*
 * mentioned the prefix — a value, an unrelated `questura_visitor.theme` —
 * chose the session-lookup branch. The decision is now made on the one cookie
 * Better Auth reads a session from: `<prefix>.session_token`, with the
 * `__Secure-` form production uses (`useSecureCookies`).
 *
 * Presence only. Whether the token is *valid* is the session lookup's job —
 * Better Auth checks the cookie's HMAC signature before touching the
 * database, so a random or malformed token costs CPU, not a query.
 */
const PREFIX = 'questura_visitor'
const SESSION_COOKIE_NAMES = new Set([`${PREFIX}.session_token`, `__Secure-${PREFIX}.session_token`])

/** Longer than any real signed token; a longer value is refused as malformed without further work. */
const MAX_TOKEN_LENGTH = 512

export function visitorSessionToken(headers: Headers): string | null {
  const header = headers.get('cookie')
  if (!header) return null

  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at < 0) continue
    const name = part.slice(0, at).trim()
    if (!SESSION_COOKIE_NAMES.has(name)) continue
    const value = part.slice(at + 1).trim()
    if (value && value.length <= MAX_TOKEN_LENGTH) return value
  }
  return null
}

export function hasVisitorSessionCookie(headers: Headers): boolean {
  return visitorSessionToken(headers) !== null
}
