import { config } from '@/lib/config'
import { publicCacheTags, publicFetchOptions } from '@/lib/cache/public-cache'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import type { PublicFetchedArticle } from './articleGuards'
import type { ArticleScope, ArticleTypeKey } from './articleScope'

type FetchArticleParams = {
  scope: ArticleScope
  type?: ArticleTypeKey
  slug: string
  lang?: string
}

export async function fetchArticle({
  scope,
  type = 'articles',
  slug,
  lang = DEFAULT_LOCALE,
}: FetchArticleParams): Promise<PublicFetchedArticle | null> {
  const params = new URLSearchParams()
  params.set('scope', scope.kind)
  if (scope.kind === 'country') params.set('country', scope.country)
  if (scope.kind === 'city') {
    params.set('country', scope.country)
    params.set('city', scope.city)
  }
  params.set('type', type)
  params.set('slug', slug)
  params.set('lang', lang)

  const url = `${config.backendUrl}/api/public/articles/by-id?${params.toString()}`
  const res = await fetch(
    url,
    publicFetchOptions([publicCacheTags.article(scope, type, slug, lang), publicCacheTags.sitemap()]),
  )

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`)

  return res.json() as Promise<PublicFetchedArticle>
}
