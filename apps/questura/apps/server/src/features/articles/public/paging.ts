/**
 * The one place a public list route decides how deep a caller may page.
 *
 * Page size has always been clamped; page number was not, and `page` is the
 * multiplier. Every offset-paged read costs something proportional to the
 * offset even when the response is one small page, so an unbounded page number
 * is an unbounded read behind a bounded response. Crawlers follow `?page=` links
 * and fabricate new ones, so "nobody would ask for page 40,000" is not a bound.
 *
 * 10,000 items is far past any real location feed or search result and still
 * small enough that the scan behind it is ordinary work.
 */
export const MAX_RESULT_WINDOW = 10_000

export type PagingWindow =
  | { ok: true; page: number; pageSize: number; offset: number }
  | { ok: false; message: string }

export function clampPageSize(raw: string | null, defaultSize: number, maxSize: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return defaultSize
  return Math.min(Math.floor(value), maxSize)
}

/**
 * A page number that is a real, in-window integer, or the reason it is not.
 *
 * Rejected before anything is read: the point is that the database never sees
 * `OFFSET 5000000000`, not that it survives it.
 */
export function resolvePagingWindow(
  rawPage: string | null,
  pageSize: number,
  maxResultWindow: number = MAX_RESULT_WINDOW,
): PagingWindow {
  const raw = (rawPage ?? '').trim()
  const value = raw === '' ? 1 : Number(raw)

  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return { ok: false, message: 'page must be a whole number of 1 or more' }
  }

  const offset = (value - 1) * pageSize

  if (offset >= maxResultWindow) {
    return {
      ok: false,
      message: `page is beyond the ${maxResultWindow}-item result window; narrow the request instead`,
    }
  }

  return { ok: true, page: value, pageSize, offset }
}
