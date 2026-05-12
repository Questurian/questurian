import type { Metadata } from 'next'
import { fetchArticle } from './fetchArticle'
import { fetchArticleByCanonicalPath } from './fetchArticleByCanonicalPath'
import type { ArticleScope, ArticleTypeKey } from './articleScope'
import { articleHrefForScope } from './articleScope'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/lib/i18n/locales'

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000'

type ArticleLikeDoc = {
  title?: string
  seoSection?: {
    metaTitle?: string
    metaDescription?: string
    openGraph?: { imageUrl?: string }
  }
  header?: { featuredImage?: { url?: string; alt_text?: string } }
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

  const title = article.seoSection?.metaTitle ?? article.title ?? ''
  const description = article.seoSection?.metaDescription ?? undefined
  const image =
    article.seoSection?.openGraph?.imageUrl ?? article.header?.featuredImage?.url ?? null

  const languages: Record<string, string> = {}
  for (const locale of SUPPORTED_LOCALES) {
    languages[locale] = canonical
  }
  languages['x-default'] = canonical

  return {
    title: title || undefined,
    description,
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      title: title || undefined,
      description,
      url: canonical,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  }
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

  const title = article.seoSection?.metaTitle ?? article.title ?? ''
  const description = article.seoSection?.metaDescription ?? undefined
  const image =
    article.seoSection?.openGraph?.imageUrl ?? article.header?.featuredImage?.url ?? null

  const languages: Record<string, string> = {}
  for (const locale of SUPPORTED_LOCALES) {
    languages[locale] = canonical
  }
  languages['x-default'] = canonical

  return {
    title: title || undefined,
    description,
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      title: title || undefined,
      description,
      url: canonical,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  }
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

  const languages: Record<string, string> = {}
  for (const locale of SUPPORTED_LOCALES) {
    languages[locale] = canonical
  }
  languages['x-default'] = canonical

  return {
    alternates: {
      canonical,
      languages,
    },
  }
}
