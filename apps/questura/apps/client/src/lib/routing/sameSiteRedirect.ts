/**
 * The only way middleware builds a redirect target: a path on the visitor's
 * own origin, or nothing.
 *
 * `new URL(location, origin)` treats a location that starts with `//` (or
 * `/\`, which URL parsing reads as `//`) as protocol-relative, so the origin
 * argument is ignored and the redirect leaves the site. Middleware builds
 * locations from request paths and from the geo-redirect cookie, and neither
 * is ours to trust.
 *
 * Checked 2026-09-24 against `next start` and the OpenNext preview: Next
 * answers `//evil.com/`, `/\evil.com/` and `/%2F%2Fevil.com/` with its own
 * same-site 308 before middleware runs, so the trailing-slash branch never
 * saw them. The geo-redirect cookie did reach it, and a `country` of
 * `/evil.com` sent `/` to `http://evil.com/x`. This helper closes both.
 *
 * Kept free of value imports on purpose: sameSiteRedirect.test.mjs loads it
 * through node's --experimental-strip-types, which does not resolve `@/`.
 */

/**
 * The absolute URL for `location` on `origin`, or null when it would land
 * anywhere else. Leading slashes and backslashes collapse to one `/`, so a
 * path can never be read as a host.
 */
export function sameSiteLocation(location: string, origin: string): URL | null {
  if (!location.startsWith('/') && !location.startsWith('\\')) return null
  // Control characters (tab, newline) are stripped by URL parsing and could
  // rejoin a split `/ /evil.com`; nothing legitimate here carries them.
  if (/[\u0000-\u001f\u007f]/.test(location)) return null

  const path = `/${location.replace(/^[/\\]+/, '')}`
  let base: URL
  let target: URL
  try {
    base = new URL(origin)
    target = new URL(path, base)
  } catch {
    return null
  }
  return target.origin === base.origin ? target : null
}

/** A URL slug segment: what a country or city id in the geo cookie must be. */
export function isSlugSegment(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value)
}
