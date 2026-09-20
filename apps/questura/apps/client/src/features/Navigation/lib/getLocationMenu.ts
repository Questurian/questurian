import { config } from '@/lib/config'
import type { LocationMenuResponse } from './fetchLocationMenu'
import { readLocationMenu } from './readLocationMenu'

export {
  LOCATION_MENU_REVALIDATE_SECONDS,
  LOCATION_MENU_TIMEOUT_MS,
} from './readLocationMenu'

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
 * time must not fail the build or blank the menu. The deadline and the failure
 * rules live in `readLocationMenu`.
 */
export async function getLocationMenu(): Promise<LocationMenuResponse | null> {
  return readLocationMenu(config.backendUrl)
}
