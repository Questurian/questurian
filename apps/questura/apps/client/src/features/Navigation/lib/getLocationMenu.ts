import { config } from '@/lib/config'
import type { LocationMenuResponse } from './fetchLocationMenu'

/**
 * Server-side read of the nav location menu.
 *
 * The menu is the first thing a visitor sees when they open the nav, so it ships
 * inside the page instead of being fetched on the click. Layouts pass the result
 * down as React Query `initialData`, which makes the open instant and skips the
 * request entirely.
 *
 * Returns null on any failure — the client query then falls back to fetching on
 * open, which is the behaviour this replaced. A backend that is down at build
 * time must not fail the build or blank the menu.
 */

// Locations change on a human timescale; an hour of staleness is invisible and
// matches the `revalidate` the public layout already runs on.
export const LOCATION_MENU_REVALIDATE_SECONDS = 3600

export async function getLocationMenu(): Promise<LocationMenuResponse | null> {
  try {
    const res = await fetch(`${config.backendUrl}/api/public/locations/menu`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: LOCATION_MENU_REVALIDATE_SECONDS },
    })

    if (!res.ok) return null

    const data = (await res.json()) as LocationMenuResponse
    return Array.isArray(data?.countries) ? data : null
  } catch {
    return null
  }
}
