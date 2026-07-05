import { config } from '@/lib/config'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

export type LocationSearchItem = {
  locationKey: string
  level: 'country' | 'city' | 'neighborhood'
  label: string
  country: string
  city: string | null
  neighborhood: string | null
}

export type LocationContentItem = {
  id: number | string
  title: string
  slug: string
  excerpt: string | null
  publishedAt: string | null
  href: string
  thumbnail: { url: string; alt: string | null } | null
  type: 'articles' | 'maps' | 'itineraries'
}

export type LocationContentResponse = {
  location: {
    locationKey: string
    level: 'country' | 'city' | 'neighborhood'
    label: string
  }
  page: number
  pageSize: number
  totalDocs: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  items: LocationContentItem[]
}

export async function searchLocations(q: string): Promise<LocationSearchItem[]> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return []

  const url = `${config.backendUrl}/api/public/locations/search?q=${encodeURIComponent(trimmed)}`
  const res = await fetch(url, { next: { revalidate: 300 } })

  if (!res.ok) return []

  const data = (await res.json()) as { items: LocationSearchItem[] }
  return data.items
}

export async function fetchLocationContent(
  key: string,
  page = 1,
  lang = DEFAULT_LOCALE,
  pageSize?: number,
): Promise<LocationContentResponse | null> {
  const params = new URLSearchParams()
  params.set('key', key)
  params.set('page', String(page))
  params.set('lang', lang)
  if (pageSize) params.set('pageSize', String(pageSize))

  const url = `${config.backendUrl}/api/public/articles/by-location?${params.toString()}`
  const res = await fetch(url, { next: { revalidate: 300 } })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch location content: ${res.status}`)

  return res.json() as Promise<LocationContentResponse>
}
