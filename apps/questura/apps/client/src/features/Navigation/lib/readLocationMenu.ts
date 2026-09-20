import type { LocationMenuResponse } from './fetchLocationMenu'

// Locations change on a human timescale; an hour of staleness is invisible and
// matches the `revalidate` the public layout already runs on.
export const LOCATION_MENU_REVALIDATE_SECONDS = 3600

/**
 * How long the public shell is allowed to wait for the menu.
 *
 * `PublicChrome` awaits this read before it returns the navbar, the page body
 * and the footer, so an unbounded read is an unbounded shell. A backend that
 * accepts the connection and then stops answering would otherwise hold every
 * public page open for as long as the socket survives.
 *
 * Healthy local samples were 360 / 48 / 80 ms for an 864-byte payload. 1.5 s is
 * roughly four times the slowest healthy sample — wide enough that a cold or
 * congested read still lands, tight enough that a hang costs a second and a
 * half instead of the whole visit. Exceeding it does not break the nav: the
 * menu falls back to loading when the reader opens it.
 */
export const LOCATION_MENU_TIMEOUT_MS = 1500

/**
 * Bounded server-side read of the nav location menu.
 *
 * Returns null on every failure. Null is the signal the client query uses to
 * fetch the menu on open, which is the behaviour this read replaced — so a
 * failure costs a request on the click, not an empty nav.
 *
 * No failure is cached. Next only writes a fetch into the data cache when the
 * response is a 200 (`next/dist/server/lib/patch-fetch.js`), so a timeout, a
 * 500 and a malformed body all leave the cache untouched and the next render
 * retries. A bad minute cannot cost an hour of empty navigation.
 *
 * Inputs are injected so the read can be exercised without a backend or a Next
 * server.
 */
export async function readLocationMenu(
  backendUrl: string,
  request: typeof fetch = fetch,
  timeoutMs: number = LOCATION_MENU_TIMEOUT_MS,
): Promise<LocationMenuResponse | null> {
  try {
    const res = await request(`${backendUrl}/api/public/locations/menu`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: LOCATION_MENU_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) return null

    const data = (await res.json()) as LocationMenuResponse
    return Array.isArray(data?.countries) ? data : null
  } catch {
    return null
  }
}
