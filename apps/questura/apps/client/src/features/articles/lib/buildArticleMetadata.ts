import type { Metadata } from 'next'
import { fetchArticle } from './fetchArticle'
import { fetchArticleByCanonicalPath } from './fetchArticleByCanonicalPath'
import type { ArticleScope, ArticleTypeKey } from './articleScope'
import { articleHrefForScope } from './articleScope'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000'

type ArticleLikeDoc = {
  title?: string
  seoSection?: {
    seoTitle?: string
    metaDescription?: string
    openGraph?: { title?: string; description?: string; imageUrl?: string }
    twitterCard?: {
      card?: 'summary' | 'summary_large_image'
      title?: string
      description?: string
      imageUrl?: string
    }
    robots?: {
      index?: 'index' | 'noindex'
      follow?: 'follow' | 'nofollow'
    }
  }
  header?: { featuredImage?: { url?: string; alt_text?: string } }
}

/**
 * hreflang alternates: only the language this article actually exists in,
 * plus x-default. Do not emit an alternate per supported locale — they would
 * all point at the same URL, which is invalid hreflang.
 */
function buildLanguageAlternates(lang: string, canonical: string): Record<string, string> {
  return {
    [lang]: canonical,
    'x-default': canonical,
  }
}

function buildMetadataFromArticle(
  article: ArticleLikeDoc,
  canonical: string,
  lang: string,
): Metadata {
  const seo = article.seoSection
  const title = seo?.seoTitle ?? article.title ?? ''
  const description = seo?.metaDescription ?? undefined
  const fallbackImage = seo?.openGraph?.imageUrl ?? article.header?.featuredImage?.url ?? null

  const ogTitle = seo?.openGraph?.title ?? title
  const ogDescription = seo?.openGraph?.description ?? description

  const twitter = seo?.twitterCard
  const twitterTitle = twitter?.title ?? ogTitle
  const twitterDescription = twitter?.description ?? ogDescription
  const twitterImage = twitter?.imageUrl ?? fallbackImage

  const robots = seo?.robots

  return {
    title: title || undefined,
    description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates(lang, canonical),
    },
    openGraph: {
      title: ogTitle || undefined,
      description: ogDescription,
      url: canonical,
      ...(fallbackImage ? { images: [{ url: fallbackImage }] } : {}),
    },
    twitter: {
      card: twitter?.card ?? 'summary_large_image',
      title: twitterTitle || undefined,
      description: twitterDescription,
      ...(twitterImage ? { images: [twitterImage] } : {}),
    },
    ...(robots
      ? {
          robots: {
            index: robots.index !== 'noindex',
            follow: robots.follow !== 'nofollow',
          },
        }
      : {}),
  }
}

type BuildParams = {
  scope: ArticleScope
  type: ArticleTypeKey
  slug: string
  lang?: string
}

export async function buildArticleMetadata({
  scope,
  type,
  slug,
  lang = DEFAULT_LOCALE,
}: BuildParams): Promise<Metadata> {
  const article = (await fetchArticle({ scope, type, slug, lang })) as
    | (ArticleLikeDoc & { canonicalPath?: string | null })
    | null
  if (!article) return {}

  const base = PUBLIC_BASE_URL.replace(/\/+$/, '')
  const path =
    typeof article.canonicalPath === 'string' && article.canonicalPath.length > 0
      ? article.canonicalPath
      : articleHrefForScope(scope, type, slug)
  const canonical = `${base}${path}`

  return buildMetadataFromArticle(article, canonical, lang)
}

type BuildByPathParams = {
  path: string
  lang?: string
}

export async function buildArticleMetadataByPath({
  path,
  lang = DEFAULT_LOCALE,
}: BuildByPathParams): Promise<Metadata> {
  const article = (await fetchArticleByCanonicalPath({ path, lang })) as ArticleLikeDoc | null
  if (!article) return {}

  const base = PUBLIC_BASE_URL.replace(/\/+$/, '')
  const canonical = `${base}${path}`

  return buildMetadataFromArticle(article, canonical, lang)
}

type BuildIndexParams = {
  scope: ArticleScope
  type: ArticleTypeKey
  page: number
}

export function buildArticleIndexMetadata({
  scope,
  type,
  page,
}: BuildIndexParams): Metadata {
  const base = PUBLIC_BASE_URL.replace(/\/+$/, '')
  const path = (() => {
    const baseSegment =
      scope.kind === 'global'
        ? `/${type}`
        : scope.kind === 'country'
          ? `/${scope.country}/${type}`
          : `/${scope.country}/${scope.city}/${type}`
    return page > 1 ? `${baseSegment}/page/${page}` : baseSegment
  })()
  const canonical = `${base}${path}`

  return {
    alternates: {
      canonical,
      languages: buildLanguageAlternates(DEFAULT_LOCALE, canonical),
    },
  }
}
