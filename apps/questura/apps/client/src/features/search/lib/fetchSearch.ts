import { config } from '@/lib/config'
import { PUBLIC_CONTENT_REVALIDATE_SECONDS, renderHeaders } from '@/lib/cache/public-cache'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { readPublicResponse } from '@/lib/cache/readPublicResponse'

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
  const res = await fetch(url, { headers: renderHeaders(), next: { revalidate: 300 } })

  if (!res.ok) return []

  const data = (await res.json()) as { items: LocationSearchItem[] }
  return data.items
}

/**
 * A search that could not be answered — overload, a rate limit, a network
 * failure — as opposed to one that found nothing. The page must say
 * "temporarily unavailable", never "No results": telling a reader there is
 * nothing about Lima because the backend was busy is a wrong answer, not a
 * degraded one (discovery finding 5).
 */
export type SearchUnavailable = { unavailable: true; status: number }

export function isSearchUnavailable(value: unknown): value is SearchUnavailable {
  return typeof value === 'object' && value !== null && (value as SearchUnavailable).unavailable === true
}

/**
 * Server-side only: called from the search page's render. It sends the
 * render token (`renderHeaders`, a non-`NEXT_PUBLIC_` variable, so a browser
 * bundle has nothing to send) so every reader's search does not land in one
 * shared per-IP bucket behind the frontend's egress address. Only a 200 is
 * written to Next's data cache, so a 429 or 503 is never served later as a
 * cached empty result.
 */
export async function searchArticles(
  q: string,
  page = 1,
  lang = DEFAULT_LOCALE,
  pageSize?: number,
): Promise<ArticleSearchResponse | SearchUnavailable | null> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return null

  const params = new URLSearchParams()
  params.set('q', trimmed)
  params.set('page', String(page))
  params.set('lang', lang)
  if (pageSize) params.set('pageSize', String(pageSize))

  const url = `${config.backendUrl}/api/public/articles/search?${params.toString()}`
  let res: Response
  try {
    res = await fetch(url, { headers: renderHeaders(), next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) })
  } catch {
    return { unavailable: true, status: 0 }
  }

  if (!res.ok) return { unavailable: true, status: res.status }

  try {
    return (await res.json()) as ArticleSearchResponse
  } catch {
    return { unavailable: true, status: res.status }
  }
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
    headers: renderHeaders(),
    next: { revalidate: LOCATION_CONTENT_REVALIDATE[cache] },
  })

  // A failed read is not an empty location: the city and country pages turn
  // `null` into notFound(), which ISR would cache.
  return readPublicResponse<LocationContentResponse>(res, 'location content')
}
