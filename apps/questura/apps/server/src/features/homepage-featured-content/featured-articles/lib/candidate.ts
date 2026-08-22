import { resolveArticleFeaturedImage } from '@/features/articles/public/view-model'
import type { MediaPlacement, PublicImage } from '@/features/media/lib/resolve-public-image'

import { HOMEPAGE_FEATURED_COLLECTION_LABELS } from '../constants'
import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedCollection,
  PayloadDocLike,
} from '../types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed)
    }
  }

  return null
}

export function getHomepageFeaturedCollectionLabel(
  relationTo: HomepageFeaturedCollection,
): string {
  return HOMEPAGE_FEATURED_COLLECTION_LABELS[relationTo]
}

function extractSeoExcerpt(doc: PayloadDocLike): string | null {
  const topLevelSection = isRecord(doc.seoSection) ? doc.seoSection : null
  const seoRoot = isRecord(doc.seo) ? doc.seo : null
  const nestedSection = seoRoot && isRecord(seoRoot.seoSection) ? seoRoot.seoSection : null

  const section = topLevelSection ?? nestedSection
  if (!section) return null

  const meta = section.metaDescription
  if (typeof meta === 'string' && meta.trim()) return meta.trim()

  return null
}

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function extractAuthorAvatar(
  author: Record<string, unknown>,
): NonNullable<HomepageFeaturedCandidate['author']>['avatar'] {
  const avatar = author.avatar
  if (!isRecord(avatar)) return null

  const url = trimmedString(avatar.url) ?? trimmedString(avatar.bunny_original_url)
  if (!url) return null

  return {
    url,
    alt: trimmedString(avatar.alt_text) ?? trimmedString(avatar.alt),
  }
}

function extractAuthorPreview(doc: PayloadDocLike): HomepageFeaturedCandidate['author'] {
  const author = doc.author
  if (!isRecord(author)) return null

  // The byline is an Authors doc (ADR-0007), which carries one authored
  // `displayName` instead of the account's name parts and email fallback.
  const displayName =
    typeof author.displayName === 'string' && author.displayName.trim()
      ? author.displayName.trim()
      : null

  const slug = typeof author.slug === 'string' && author.slug.trim() ? author.slug.trim() : null
  const avatar = extractAuthorAvatar(author)

  return {
    id: normalizeNumericId(author.id),
    slug,
    name: displayName,
    ...(avatar ? { avatar } : {}),
  }
}

function extractCategoryPreview(doc: PayloadDocLike): HomepageFeaturedCandidate['category'] {
  const category = doc.category
  if (!isRecord(category)) return null

  const name =
    typeof category.name === 'string' && category.name.trim() ? category.name.trim() : null
  const slug =
    typeof category.slug === 'string' && category.slug.trim() ? category.slug.trim() : null

  return {
    id: normalizeNumericId(category.id),
    name,
    slug,
  }
}

function resolveFeaturedPlacement(
  doc: PayloadDocLike,
  placement: MediaPlacement,
  allowMigrationFallback = true,
): PublicImage | null {
  const resolved = resolveArticleFeaturedImage(doc, { placement, allowMigrationFallback })
  return resolved.url ? resolved : null
}

export function normalizeHomepageFeaturedCandidate(
  relationTo: HomepageFeaturedCollection,
  doc: PayloadDocLike,
): HomepageFeaturedCandidate {
  const metaDescription = extractSeoExcerpt(doc)
  const author = extractAuthorPreview(doc)
  const image = resolveFeaturedPlacement(doc, 'card')
  const imageSquare = resolveFeaturedPlacement(doc, 'square-card')
  const imageWide = resolveFeaturedPlacement(doc, 'wide-card', false)
  const imageHero = resolveFeaturedPlacement(doc, 'hero', false)

  return {
    relationTo,
    id: normalizeNumericId(doc.id) ?? 0,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled',
    slug: typeof doc.slug === 'string' && doc.slug.trim() ? doc.slug : null,
    canonicalPath: typeof doc.canonicalPath === 'string' && doc.canonicalPath.trim() ? doc.canonicalPath : null,
    locationKey: typeof doc.location === 'string' && doc.location.trim() ? doc.location : null,
    status: typeof doc.status === 'string' && doc.status.trim() ? doc.status : null,
    updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
    publishedAt:
      typeof doc.publishedAt === 'string' && doc.publishedAt.trim() ? doc.publishedAt : null,
    collectionLabel: getHomepageFeaturedCollectionLabel(relationTo),
    imageUrl: image?.url ?? null,
    imageUrlSquare: imageSquare?.url ?? null,
    image,
    imageSquare,
    imageWide,
    imageHero,
    metaDescription,
    excerpt: metaDescription,
    author,
    authorLabel: author?.name ?? null,
    category: extractCategoryPreview(doc),
  }
}

export function sortHomepageFeaturedCandidates(
  left: HomepageFeaturedCandidate,
  right: HomepageFeaturedCandidate,
): number {
  const leftTimestamp = Date.parse(left.updatedAt || left.publishedAt || '') || 0
  const rightTimestamp = Date.parse(right.updatedAt || right.publishedAt || '') || 0

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp
  }

  return left.title.localeCompare(right.title)
}
