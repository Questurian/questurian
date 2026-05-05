import { config } from '@/lib/config'
import { Article } from '../types'

type FetchArticleParams = {
  country: string
  city: string
  slug: string
  type?: string | null
}

export async function fetchArticle({
  country,
  city,
  type,
  slug,
}: FetchArticleParams): Promise<Article | null> {
  const base = `${config.backendUrl}/api/public/articles`
  const url = type
    ? `${base}/${encodeURIComponent(country)}/${encodeURIComponent(city)}/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`
    : `${base}/${encodeURIComponent(country)}/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`

  console.log('[fetchArticle]', url)

  const res = await fetch(url, { cache: 'no-store' })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`)

  return res.json() as Promise<Article>
}
