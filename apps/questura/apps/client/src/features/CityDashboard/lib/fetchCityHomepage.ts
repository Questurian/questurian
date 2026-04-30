import { config } from '@/lib/config'
import type { CityHomepageResponse } from '../types'

export async function fetchCityHomepage(
  country: string,
  city: string,
): Promise<CityHomepageResponse | null> {
  const url = `${config.backendUrl}/api/public/location-homepages/${encodeURIComponent(country)}/${encodeURIComponent(city)}`
  const res = await fetch(url, { cache: 'no-store' })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch city homepage: ${res.status}`)

  return res.json() as Promise<CityHomepageResponse>
}
