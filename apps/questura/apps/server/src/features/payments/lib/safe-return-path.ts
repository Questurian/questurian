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

  // Whatever the checks above missed, the browser's own parser decides.
  try {
    return new URL(path, PROBE_ORIGIN).origin === PROBE_ORIGIN
  } catch {
    return false
  }
}

const PROBE_ORIGIN = 'https://return-path-check.invalid'

/**
 * How many more decodes a value may survive. The success page decodes once
 * reading its query and the client guard decodes again, so a value is
 * checked at every layer it could be peeled to, not only the first.
 */
const MAX_LATER_DECODES = 3

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

  // Checking only this first decode let `/%252F%252Fevil.example` through:
  // safe here, `//evil.example` two decodes later in the browser. Every layer
  // it can be peeled to must be safe too.
  let layer = candidate
  for (let decodes = 0; decodes <= MAX_LATER_DECODES; decodes += 1) {
    if (!isSafeReturnPath(layer)) return DEFAULT_RETURN_PATH
    let next: string
    try {
      next = decodeURIComponent(layer)
    } catch {
      return DEFAULT_RETURN_PATH
    }
    if (next === layer) return candidate
    layer = next
  }

  // Still changing after that many decodes: nobody writes a path like that.
  return DEFAULT_RETURN_PATH
}
