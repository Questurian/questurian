import { config } from '@/lib/config'

export type MapsArticleTeaser = {
  id: number
  title: string
  slug: string
  header?: {
    featuredImage?: { url: string; alt_text?: string } | null
  } | null
}

export async function fetchMapsArticlesList(
  country: string,
  city: string,
): Promise<MapsArticleTeaser[]> {
  const url = `${config.backendUrl}/api/public/articles/${encodeURIComponent(country)}/${encodeURIComponent(city)}/maps`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data?.docs ?? data?.articles ?? [])
  } catch {
    return []
  }
}
