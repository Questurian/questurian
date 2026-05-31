import type { LocationHomepageDoc } from '../types'

import { resolvePageBlocks } from './resolve-blocks'

export function formatHomepageDoc(
  doc: LocationHomepageDoc,
  resolvedBlocks: Awaited<ReturnType<typeof resolvePageBlocks>>,
  extra?: { publishedPageBlocks?: Awaited<ReturnType<typeof resolvePageBlocks>> },
) {
  const location =
    typeof doc.location === 'object' && doc.location !== null ? doc.location : null

  return {
    id: doc.id,
    isEnabled: doc.isEnabled ?? false,
    location: location
      ? {
          id: location.id,
          locationKey: location.locationKey ?? null,
          level: location.level ?? null,
          countryName: location.countryName ?? null,
          cityName: location.cityName ?? null,
          neighborhoodName: location.neighborhoodName ?? null,
        }
      : null,
    pageBlocks: resolvedBlocks,
    publishedPageBlocks: extra?.publishedPageBlocks ?? [],
    lastPublishedAt: doc.lastPublishedAt ?? null,
    lastPublishedBy: doc.lastPublishedBy ?? null,
    publishedRevision: doc.publishedRevision ?? 0,
  }
}
