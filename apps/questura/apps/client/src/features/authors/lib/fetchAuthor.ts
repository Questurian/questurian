import { config } from '@/lib/config'
import { publicFetchOptions } from '@/lib/cache/public-cache'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

export type AuthorArticleItem = {
  id: number | string
  title: string
  slug: string
  excerpt: string | null
  publishedAt: string | null
  href: string
  thumbnail: { url: string; alt: string | null } | null
}

export type AuthorSocialLinks = {
  instagram: string | null
  twitter: string | null
  facebook: string | null
  linkedin: string | null
  reddit: string | null
  youtube: string | null
  patreon: string | null
  website: string | null
}

export type PublicAuthor = {
  id: number
  slug: string | null
  displayName: string | null
  bio: string | null
  avatar: { url: string; alt: string | null } | null
  socialLinks: AuthorSocialLinks | null
  articles: AuthorArticleItem[]
}

/** Accepts the author slug (canonical) or a numeric id (legacy URLs). */
export async function fetchAuthor(
  slugOrId: string | number,
  lang: string = DEFAULT_LOCALE,
): Promise<PublicAuthor | null> {
  const url = `${config.backendUrl}/api/public/authors/${encodeURIComponent(String(slugOrId))}?lang=${encodeURIComponent(lang)}`
  const res = await fetch(url, publicFetchOptions([`author:${slugOrId}`]))

  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) throw new Error(`Failed to fetch author: ${res.status}`)

  const author = (await res.json()) as PublicAuthor
  return {
    ...author,
    slug: author.slug ?? null,
    avatar: author.avatar ?? null,
    articles: author.articles ?? [],
  }
}
