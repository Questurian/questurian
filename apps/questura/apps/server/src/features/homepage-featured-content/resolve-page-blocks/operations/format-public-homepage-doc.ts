import { publicLocationLabel } from '@/shared/location/server/publicLocationLabel'
import { formatPublicHomepageBlock } from '../lib/format-public-block'
import { resolvePageBlocks } from './resolve-blocks'
import type { LocationDoc } from '../types'

type LocationContext = { country: string; city: string }

/**
 * The location row behind the page, as the client needs it.
 *
 * The client's `CityHomepageResponse` has always declared this field and the
 * endpoint has never sent it, so the city page had to fetch a 50-item content
 * list purely to learn that the page is called "Lima, Peru". That fetch
 * carried a 300s revalidate and capped the whole route's cache life at five
 * minutes. Sending the name with the blocks is what lets the page drop it.
 */
function formatPublicLocation(doc: LocationDoc) {
  return {
    id: doc.id,
    locationKey: doc.locationKey ?? null,
    level: doc.level ?? null,
    countryName: doc.countryName ?? null,
    cityName: doc.cityName ?? null,
    neighborhoodName: doc.neighborhoodName ?? null,
    label: publicLocationLabel(doc),
  }
}

export function formatPublicLocationHomepageDoc(
  resolvedBlocks: Awaited<ReturnType<typeof resolvePageBlocks>>,
  location?: LocationContext,
  locationDoc?: LocationDoc,
) {
  return {
    location: locationDoc ? formatPublicLocation(locationDoc) : null,
    pageBlocks: resolvedBlocks.flatMap((block) => {
      const publicBlock = formatPublicHomepageBlock(block, location)
      return publicBlock ? [publicBlock] : []
    }),
  }
}
