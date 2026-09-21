/**
 * Whether a Payload read failed because the document does not exist.
 *
 * Curated-page repositories used to catch *every* error and return `null`, so
 * a statement timeout, a pool that could not hand out a connection or a
 * dropped database looked exactly like an editor having deleted the article:
 * the slot quietly vanished and the page answered 200. The frontend then
 * cached that partial page for an hour and the CDN for another minute.
 *
 * Only a genuine not-found may be omitted. Everything else must propagate, so
 * the route answers 5xx, nothing caches the answer, and the frontend keeps
 * serving the last good page (Next only writes a fetch to its data cache on a
 * 200).
 *
 * Payload's `NotFound` is an `APIError` with `status` 404; checked by shape
 * rather than `instanceof` so a duplicated package copy cannot break it.
 */
export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; name?: unknown }
  return candidate.status === 404 || candidate.name === 'NotFound'
}

/** For `catch` blocks: return the fallback for not-found, rethrow anything else. */
export function whenNotFound<T>(error: unknown, fallback: T): T {
  if (isNotFoundError(error)) return fallback
  throw error
}
