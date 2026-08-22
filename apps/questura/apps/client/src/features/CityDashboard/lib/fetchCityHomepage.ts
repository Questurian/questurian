import { config } from '@/lib/config'
import { publicCacheTags, publicFetchOptions } from '@/lib/cache/public-cache'
import type { CityHomepageResponse } from '../types'

export async function fetchCityHomepage(
  country: string,
  city: string,
): Promise<CityHomepageResponse | null> {
  const url = `${config.backendUrl}/api/public/location-homepages/${encodeURIComponent(country)}/${encodeURIComponent(city)}`
  const res = await fetch(
    url,
    publicFetchOptions([
      publicCacheTags.locationHomepage(country, city),
      publicCacheTags.sitemap(),
    ]),
  )

  if (!res.ok) return null

  return res.json() as Promise<CityHomepageResponse>
}

export async function fetchNeighborhoodHomepage(
  country: string,
  city: string,
  neighborhood: string,
): Promise<CityHomepageResponse | null> {
  const url = `${config.backendUrl}/api/public/location-homepages/${encodeURIComponent(country)}/${encodeURIComponent(city)}/${encodeURIComponent(neighborhood)}`
  const res = await fetch(
    url,
    publicFetchOptions([
      publicCacheTags.locationHomepage(country, city, neighborhood),
      publicCacheTags.sitemap(),
    ]),
  )

  if (!res.ok) return null
  return res.json() as Promise<CityHomepageResponse>
}
