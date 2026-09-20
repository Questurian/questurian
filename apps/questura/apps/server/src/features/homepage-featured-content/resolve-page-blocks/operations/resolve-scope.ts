import type { PayloadInstance } from '@/types'

import type { LocationHomepageDoc } from '../types'

import { resolveLocationGridScopeFromLocation } from '../../location-grid/service'

type KnownLocation = { id?: unknown; level?: unknown; locationKey?: unknown }

/**
 * The scope a page's location grid may select from.
 *
 * A homepage read at `depth: 0` carries its location as a bare ID, so this used
 * to fetch it -- a second read of a row the caller had almost always just
 * loaded in order to find the homepage in the first place. Callers that already
 * hold the location pass it in; the fetch stays for the ones that do not.
 */
export async function resolveLocationGridScope(
  payload: PayloadInstance,
  rawLocation: LocationHomepageDoc['location'],
  knownLocation?: KnownLocation | null,
) {
  if (typeof rawLocation === 'object' && rawLocation !== null) {
    return resolveLocationGridScopeFromLocation(rawLocation)
  }

  if (!rawLocation) {
    return null
  }

  // Only trust the caller's copy when it is demonstrably the same row. The
  // homepage was found by this location's ID, so they match -- but a future
  // caller passing the wrong document would silently scope the grid to the
  // wrong city, and that is not a failure anything else would catch.
  if (knownLocation && String(knownLocation.id) === String(rawLocation)) {
    return resolveLocationGridScopeFromLocation(knownLocation)
  }

  const location = await payload.findByID({
    collection: 'locations',
    id: rawLocation,
    depth: 0,
    overrideAccess: true,
  })

  return resolveLocationGridScopeFromLocation(
    location as { level?: unknown; locationKey?: unknown } | null,
  )
}
