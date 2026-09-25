/**
 * Whether a URL segment can be a location slug at all.
 *
 * Location keys are `[a-z0-9-]` segments joined by `|`; the backend holds
 * `/api/public/articles/by-location` to exactly that (LOCATION_KEY_PATTERN in
 * the server's by-location route) and answers 400 for anything else. The
 * country page used to pass whatever the URL held, so `/evil.com` or
 * `/foo.bar` went to the backend, came back 400, and the page threw: a 500
 * for what is plainly a missing page. Checking here renders the normal 404
 * without a backend round trip.
 *
 * Case-insensitive because the backend lowercases the key before checking
 * it, and `/Peru` renders today.
 *
 * Dependency-free so the client's node:test suite can load it.
 */
const LOCATION_SLUG = /^[a-z0-9-]+$/i

export function isLocationSlug(segment: string): boolean {
  return LOCATION_SLUG.test(segment)
}
