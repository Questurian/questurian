import { config } from '@/lib/config'

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
  city: string | null | undefined,
  currentSlug: string,
): Promise<RelatedMapsArticleTeaser[]> {
  const params = new URLSearchParams({ currentSlug })
  const locationSegment = city ?? '_country'
  const url = `${config.backendUrl}/api/public/articles/${encodeURIComponent(country)}/${encodeURIComponent(locationSegment)}/maps?${params.toString()}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data?.docs ?? data?.articles ?? [])
  } catch {
    return []
  }
}
