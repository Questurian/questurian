import { config } from '@/lib/config'

export type LocationMenuCity = {
  locationKey: string
  label: string
  href: string
}

export type LocationMenuCountry = {
  locationKey: string
  label: string
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
