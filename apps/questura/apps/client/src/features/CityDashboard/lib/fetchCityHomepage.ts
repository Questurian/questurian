import { config } from '@/lib/config'
import { publicCacheTags, publicFetchOptions } from '@/lib/cache/public-cache'
import { LastGood, validatedAtFrom } from '@/lib/cache/lastGood'
import { readPublicResponse } from '@/lib/cache/readPublicResponse'
import type { CityHomepageResponse } from '../types'

// Curated pages only; see lastGood.ts for why articles do not do this.
const lastGoodHomepages = new LastGood()

function logFallback(what: string) {
  return (error: unknown, info: { ageMs: number; served: number }) => {
    // The age reported is the origin's, not this process's. A fetch served
    // out of Next's data cache used to reset the clock and make an old page
    // look freshly validated.
    console.warn(
      `[public-cache] serving last good ${what} (origin confirmed ${Math.round(info.ageMs / 1000)}s ago, ${info.served} served this process):`,
      error instanceof Error ? error.message : error,
    )
  }
}

export async function fetchCityHomepage(
  country: string,
  city: string,
): Promise<CityHomepageResponse | null> {
  const url = `${config.backendUrl}/api/public/location-homepages/${encodeURIComponent(country)}/${encodeURIComponent(city)}`
  return lastGoodHomepages.read(url, async () => {
    const res = await fetch(
      url,
      publicFetchOptions([
        publicCacheTags.locationHomepage(country, city),
        publicCacheTags.sitemap(),
      ]),
    )
    return {
      value: await readPublicResponse<CityHomepageResponse>(res, 'city homepage'),
      validatedAt: validatedAtFrom(res),
    }
  }, logFallback(`city homepage ${country}/${city}`))
}

export async function fetchNeighborhoodHomepage(
  country: string,
  city: string,
  neighborhood: string,
): Promise<CityHomepageResponse | null> {
  const url = `${config.backendUrl}/api/public/location-homepages/${encodeURIComponent(country)}/${encodeURIComponent(city)}/${encodeURIComponent(neighborhood)}`
  return lastGoodHomepages.read(url, async () => {
    const res = await fetch(
      url,
      publicFetchOptions([
        publicCacheTags.locationHomepage(country, city, neighborhood),
        publicCacheTags.sitemap(),
      ]),
    )
    return {
      value: await readPublicResponse<CityHomepageResponse>(res, 'neighborhood homepage'),
      validatedAt: validatedAtFrom(res),
    }
  }, logFallback(`neighborhood homepage ${country}/${city}/${neighborhood}`))
}
