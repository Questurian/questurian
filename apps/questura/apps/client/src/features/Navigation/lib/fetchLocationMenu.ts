import { config } from '@/lib/config'

export type LocationMenuCity = {
  locationKey: string
  label: string
  href: string
}

export type LocationMenuCountry = {
  locationKey: string
  label: string
  /** ISO 3166-1 alpha-2, uppercase. Null when the server could not match a country. */
  countryCode: string | null
  href: string
  cities: LocationMenuCity[]
}

export type LocationMenuResponse = {
  countries: LocationMenuCountry[]
}

export async function fetchLocationMenu(): Promise<LocationMenuResponse> {
  const url = `${config.backendUrl}/api/public/locations/menu`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch location menu: ${res.status}`)
  }

  return res.json() as Promise<LocationMenuResponse>
}
