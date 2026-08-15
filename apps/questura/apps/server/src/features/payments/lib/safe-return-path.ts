/**
 * Validates a caller-supplied post-checkout return path.
 *
 * The client has its own guard, which is irrelevant here: this value is
 * attacker-controlled by definition and ends up in a URL Stripe redirects a
 * browser to. An unvalidated one turns the checkout flow into an open redirect
 * with a payment-shaped pretext in front of it.
 *
 * Relative paths only. Anything else -- absolute URLs, protocol-relative
 * `//host`, `javascript:`, a decode that throws -- collapses to the account
 * page rather than being repaired, because a return path we cannot read is a
 * return path we should not honour.
 */
export const DEFAULT_RETURN_PATH = '/account'

const MAX_RETURN_PATH_LENGTH = 512

export function isSafeReturnPath(path: string): boolean {
  if (!path || path.length > MAX_RETURN_PATH_LENGTH) return false

  // Must be root-relative. `//evil.test` is protocol-relative, not relative.
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false

  // A backslash is treated as a path separator by some browsers, so `/\evil.test`
  // can navigate off-origin even though it starts with a single slash.
  if (path.includes('\\')) return false

  if (path.includes('://')) return false

  const lowered = path.toLowerCase()
  if (lowered.includes('javascript:') || lowered.includes('data:')) return false

  // Control characters, including the newline that would let this value inject
  // a second query parameter or header downstream.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(path)) return false

  return true
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_RETURN_PATH

  let candidate = value
  try {
    // Accept either an encoded or a plain path; a double-encoded hostile value
    // must not survive by being decoded later than it is checked.
    candidate = decodeURIComponent(value)
  } catch {
    return DEFAULT_RETURN_PATH
  }

  return isSafeReturnPath(candidate) ? candidate : DEFAULT_RETURN_PATH
}
