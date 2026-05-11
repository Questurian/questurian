import { config } from '@/lib/config'

export type CountryCity = {
  slug: string
  name: string | null
  href: string
}

export type CountryCitiesResponse = {
  country: {
    slug: string
    name: string | null
  }
  cities: CountryCity[]
}

export async function fetchCountryCities(
  country: string,
): Promise<CountryCitiesResponse | null> {
  const url = `${config.backendUrl}/api/public/countries/${encodeURIComponent(country)}/cities`
  const res = await fetch(url, { cache: 'no-store' })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch country cities: ${res.status}`)

  return res.json() as Promise<CountryCitiesResponse>
}
