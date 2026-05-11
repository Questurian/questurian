import { config } from '@/lib/config'
import type { PublicFetchedArticle } from './articleGuards'

type FetchArticleParams = {
  country: string
  city?: string | null
  slug: string
  type?: string | null
}

const COUNTRY_SCOPE_SEGMENT = '_country'

export async function fetchArticle({
  country,
  city,
  type,
  slug,
}: FetchArticleParams): Promise<PublicFetchedArticle | null> {
  const base = `${config.backendUrl}/api/public/articles`
  const locationSegment = city ?? COUNTRY_SCOPE_SEGMENT
  const url = type
    ? `${base}/${encodeURIComponent(country)}/${encodeURIComponent(locationSegment)}/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`
    : `${base}/${encodeURIComponent(country)}/${encodeURIComponent(locationSegment)}/${encodeURIComponent(slug)}`

  console.log('[fetchArticle]', url)

  const res = await fetch(url, { cache: 'no-store' })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`)

  return res.json() as Promise<PublicFetchedArticle>
}
