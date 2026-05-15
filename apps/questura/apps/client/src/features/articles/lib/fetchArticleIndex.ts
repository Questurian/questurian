import { config } from '@/lib/config'
import { publicCacheTags, publicFetchOptions } from '@/lib/cache/public-cache'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import type { ArticleScope, ArticleTypeKey } from './articleScope'

export type ArticleIndexItem = {
  id: number | string
  title: string
  slug: string
  excerpt: string | null
  publishedAt: string | null
  href: string
  thumbnail: { url: string; alt: string | null } | null
}

export type ArticleIndexResponse = {
  page: number
  pageSize: number
  totalDocs: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  items: ArticleIndexItem[]
}

type FetchArticleIndexParams = {
  scope: ArticleScope
  type: ArticleTypeKey
  page?: number
  pageSize?: number
  lang?: string
}

export async function fetchArticleIndex({
  scope,
  type,
  page = 1,
  pageSize = 20,
  lang = DEFAULT_LOCALE,
}: FetchArticleIndexParams): Promise<ArticleIndexResponse | null> {
  const params = new URLSearchParams()
  params.set('scope', scope.kind)
  if (scope.kind === 'country') params.set('country', scope.country)
  if (scope.kind === 'city') {
    params.set('country', scope.country)
    params.set('city', scope.city)
  }
  params.set('type', type)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  params.set('lang', lang)

  const url = `${config.backendUrl}/api/public/articles/index?${params.toString()}`
  const res = await fetch(
    url,
    publicFetchOptions([
      publicCacheTags.articleIndex(scope, type, page, lang),
      publicCacheTags.articleIndexScope(scope, type, lang),
      publicCacheTags.sitemap(),
    ]),
  )

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`)

  return res.json() as Promise<ArticleIndexResponse>
}
