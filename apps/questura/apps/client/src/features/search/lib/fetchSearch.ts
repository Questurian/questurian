import { config } from '@/lib/config'
import { PUBLIC_CONTENT_REVALIDATE_SECONDS } from '@/lib/cache/public-cache'
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

export type ArticleSearchResponse = {
  q: string
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

export async function searchArticles(
  q: string,
  page = 1,
  lang = DEFAULT_LOCALE,
  pageSize?: number,
): Promise<ArticleSearchResponse | null> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return null

  const params = new URLSearchParams()
  params.set('q', trimmed)
  params.set('page', String(page))
  params.set('lang', lang)
  if (pageSize) params.set('pageSize', String(pageSize))

  const url = `${config.backendUrl}/api/public/articles/search?${params.toString()}`
  const res = await fetch(url, { next: { revalidate: 300 } })

  if (!res.ok) return null

  return res.json() as Promise<ArticleSearchResponse>
}

/**
 * How long a caller is willing to serve this list from cache.
 *
 * This used to be hardcoded at 300s for every caller. Next takes the shortest
 * revalidate of any fetch in a render, so one search-shaped default sitting in
 * a cached page capped that whole route at five minutes — /peru/lima and
 * /peru rebuilt twelve times as often as every other public page. Search wants
 * the short window; a location page wants the same hour as its other content.
 */
export type LocationContentCache = 'search' | 'public-page'

const LOCATION_CONTENT_REVALIDATE: Record<LocationContentCache, number> = {
  search: 300,
  'public-page': PUBLIC_CONTENT_REVALIDATE_SECONDS,
}

export async function fetchLocationContent(
  key: string,
  page = 1,
  lang = DEFAULT_LOCALE,
  pageSize?: number,
  cache: LocationContentCache = 'search',
): Promise<LocationContentResponse | null> {
  const params = new URLSearchParams()
  params.set('key', key)
  params.set('page', String(page))
  params.set('lang', lang)
  if (pageSize) params.set('pageSize', String(pageSize))

  const url = `${config.backendUrl}/api/public/articles/by-location?${params.toString()}`
  const res = await fetch(url, {
    next: { revalidate: LOCATION_CONTENT_REVALIDATE[cache] },
  })

  if (!res.ok) return null

  return res.json() as Promise<LocationContentResponse>
}
