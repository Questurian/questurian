import { config } from '@/lib/config'
import { publicCacheTags, publicFetchOptions } from '@/lib/cache/public-cache'
import { LastGood } from '@/lib/cache/lastGood'
import { readPublicResponse } from '@/lib/cache/readPublicResponse'
import type { CityHomepageResponse } from '../types'

// Curated pages only; see lastGood.ts for why articles do not do this.
const lastGoodHomepages = new LastGood()

function logFallback(what: string) {
  return (error: unknown, ageMs: number) => {
    console.warn(
      `[public-cache] serving last good ${what} (${Math.round(ageMs / 1000)}s old):`,
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
    return readPublicResponse<CityHomepageResponse>(res, 'city homepage')
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
    return readPublicResponse<CityHomepageResponse>(res, 'neighborhood homepage')
  }, logFallback(`neighborhood homepage ${country}/${city}/${neighborhood}`))
}
