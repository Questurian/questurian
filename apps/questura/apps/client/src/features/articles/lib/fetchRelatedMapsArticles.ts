import { config } from '@/lib/config'
import { publicCacheTags, publicFetchOptions } from '@/lib/cache/public-cache'

export type RelatedMapsArticleTeaser = {
  id: number | string
  title: string
  slug: string
  routeType: 'maps' | 'itinerary'
  header?: {
    featuredImage?: { url: string; alt_text?: string } | null
  } | null
}

export async function fetchRelatedMapsArticles(
  country: string,
  city: string | null,
  currentSlug: string,
): Promise<RelatedMapsArticleTeaser[]> {
  const params = new URLSearchParams()
  params.set('country', country)
  if (city) params.set('city', city)
  if (currentSlug) params.set('currentSlug', currentSlug)

  const url = `${config.backendUrl}/api/public/articles/related?${params.toString()}`

  try {
    const res = await fetch(
      url,
      publicFetchOptions([
        publicCacheTags.relatedMapsArticles(country, city, currentSlug),
        publicCacheTags.relatedMapsScope(country, city),
      ]),
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
