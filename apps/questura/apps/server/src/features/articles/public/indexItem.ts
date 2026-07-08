import { resolveArticleFeaturedImage } from './view-model'
import { articleHrefForScope, type ArticleScope, type ArticleTypeKey } from './scope'

export type IndexItem = {
  id: number | string
  title: string
  slug: string
  excerpt: string | null
  publishedAt: string | null
  href: string
  thumbnail: { url: string; alt: string | null } | null
}

function pickTitle(doc: Record<string, unknown>): string {
  return typeof doc.title === 'string' ? doc.title : ''
}

function pickExcerpt(doc: Record<string, unknown>): string | null {
  const seo = doc.seoSection as Record<string, unknown> | undefined
  const desc = seo?.metaDescription
  if (typeof desc === 'string' && desc.trim()) return desc.trim()
  return null
}

function pickThumbnail(doc: Record<string, unknown>): IndexItem['thumbnail'] {
  const image = resolveArticleFeaturedImage(doc, { placement: 'card' })
  if (!image.url) return null
  return { url: image.url, alt: image.alt || null }
}

export function scopeFromLocationString(location: unknown): ArticleScope {
  const parts = (typeof location === 'string' ? location : '').split('|').filter(Boolean)
  if (parts.length === 0) return { kind: 'global' }
  if (parts.length === 1) return { kind: 'country', country: parts[0] }
  return { kind: 'city', country: parts[0], city: parts[1] }
}

export function serializeIndexItem(rawDoc: unknown, type: ArticleTypeKey): IndexItem {
  const doc = rawDoc as Record<string, unknown>
  const slug = typeof doc.slug === 'string' ? doc.slug : ''
  const id = (doc.id as number | string | undefined) ?? slug

  const itemScope = scopeFromLocationString(doc.location)

  // Prefer the stored canonicalPath for city-scope standard articles so
  // index links go straight to the category-based URL.
  const canonical = typeof doc.canonicalPath === 'string' ? doc.canonicalPath : null
  const href = canonical ?? articleHrefForScope(itemScope, type, slug)

  return {
    id,
    title: pickTitle(doc),
    slug,
    excerpt: pickExcerpt(doc),
    publishedAt: typeof doc.publishedAt === 'string' ? doc.publishedAt : null,
    href,
    thumbnail: pickThumbnail(doc),
  }
}
