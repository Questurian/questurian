import { config } from '@/lib/config'

export type CityHomepageLocation = {
  id: number
  locationKey: string | null
  level: string | null
  countryName: string | null
  cityName: string | null
  neighborhoodName: string | null
}

export type CityHomepageResponse = {
  id: number
  isEnabled: boolean
  location: CityHomepageLocation | null
  pageBlocks: unknown[]
}

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
