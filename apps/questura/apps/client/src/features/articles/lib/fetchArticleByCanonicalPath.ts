import { config } from '@/lib/config'
import { publicCacheTags, publicFetchOptions } from '@/lib/cache/public-cache'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import type { PublicFetchedArticle } from './articleGuards'

type FetchByPathParams = {
  path: string
  lang?: string
}

export async function fetchArticleByCanonicalPath({
  path,
  lang = DEFAULT_LOCALE,
}: FetchByPathParams): Promise<PublicFetchedArticle | null> {
  const params = new URLSearchParams()
  params.set('path', path)
  params.set('lang', lang)

  const url = `${config.backendUrl}/api/public/articles/by-canonical-path?${params.toString()}`
  const res = await fetch(
    url,
    publicFetchOptions([publicCacheTags.articlePath(path, lang), publicCacheTags.sitemap()]),
  )

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`)

  return res.json() as Promise<PublicFetchedArticle>
}

export type RedirectLookupResult = { newPath: string; statusCode: 301 | 308 }

export async function fetchRedirectByPath(path: string): Promise<RedirectLookupResult | null> {
  const params = new URLSearchParams()
  params.set('path', path)
  const url = `${config.backendUrl}/api/public/redirects/by-path?${params.toString()}`
  const res = await fetch(url, publicFetchOptions([publicCacheTags.articleRedirect(path)]))

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch redirect: ${res.status}`)

  const body = (await res.json()) as { newPath?: unknown; statusCode?: unknown }
  if (typeof body.newPath !== 'string') return null
  const statusCode = body.statusCode === 308 ? 308 : 301
  return { newPath: body.newPath, statusCode }
}
