import { config } from '@/lib/config'
import { publicCacheTags, publicFetchOptions } from '@/lib/cache/public-cache'
import { readPublicResponse } from '@/lib/cache/readPublicResponse'

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
  const res = await fetch(
    url,
    publicFetchOptions([publicCacheTags.countryCities(country), publicCacheTags.sitemap()]),
  )

  // 404 and 400 are "no such country"; anything else fails the render
  // (lib/cache/readPublicResponse.ts).
  return readPublicResponse<CountryCitiesResponse>(res, 'country cities')
}
