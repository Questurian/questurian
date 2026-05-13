import type { getPayload } from 'payload'

import type { LocationHomepageDoc } from '../types'

import { resolveLocationGridScopeFromLocation } from '../../location-grid/service'

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>

export async function resolveLocationGridScope(
  payload: PayloadInstance,
  rawLocation: LocationHomepageDoc['location'],
) {
  if (typeof rawLocation === 'object' && rawLocation !== null) {
    return resolveLocationGridScopeFromLocation(rawLocation)
  }

  if (!rawLocation) {
    return null
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
