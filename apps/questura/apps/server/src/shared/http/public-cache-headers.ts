import type { NextResponse } from 'next/server'

/**
 * `Cache-Control` for the public read routes.
 *
 * None of them sent one. The frontend's own cache is a `next: { revalidate }`
 * with tags, which covers rendered pages and nothing else: a crawler, a direct
 * API caller or anything sitting between the two ran the full query every time
 * because the response never said it could be reused.
 *
 * Deliberately short. The tag invalidation the frontend uses is how a publish
 * reaches readers promptly, and a long `s-maxage` on the API would sit in
 * front of that and hold the old copy anyway. A minute bounds repeated
 * identical work without putting a publish behind a wall, and
 * `stale-while-revalidate` means the refresh happens off the reader's request.
 */
export const PUBLIC_READ_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=600'

/** Nothing shared may cache this: it is about one caller or one session. */
export const PRIVATE_CACHE_CONTROL = 'private, no-store'

export function withPublicCacheHeaders(response: NextResponse): NextResponse {
  // Never widen an error into a cacheable response: a 404 cached for ten
  // minutes outlives the publish that fixes it.
  if (response.status >= 400) {
    response.headers.set('Cache-Control', PRIVATE_CACHE_CONTROL)
    return response
  }

  response.headers.set('Cache-Control', PUBLIC_READ_CACHE_CONTROL)
  return response
}
