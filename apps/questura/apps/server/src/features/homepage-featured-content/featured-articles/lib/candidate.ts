import {
  resolveLegacyAssetForPlacement,
  resolveMediaSetForPlacement,
  type MediaPlacement,
  type PublicImage,
} from '@/features/media/lib/resolve-public-image'

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

function extractAuthorPreview(doc: PayloadDocLike): HomepageFeaturedCandidate['author'] {
  const author = doc.author
  if (!isRecord(author)) return null

  const first = typeof author.firstName === 'string' ? author.firstName.trim() : ''
  const last = typeof author.lastName === 'string' ? author.lastName.trim() : ''
  const name = [first, last].filter(Boolean).join(' ')

  const email = typeof author.email === 'string' ? author.email.trim() : ''
  const displayName = name || email || null

  return {
    id: normalizeNumericId(author.id),
    name: displayName,
    firstName: first || null,
    lastName: last || null,
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

function getFeaturedHeaderSection(doc: PayloadDocLike): Record<string, unknown> | null {
  // Articles use `headerSection`; listicles and itineraries use `header`
  if (isRecord(doc.headerSection)) return doc.headerSection
  if (isRecord(doc.header)) return doc.header
  return null
}

function resolveFeaturedPlacement(
  doc: PayloadDocLike,
  placement: MediaPlacement,
): PublicImage | null {
  const section = getFeaturedHeaderSection(doc)
  if (!section) return null

  const directMediaSet = isRecord(section.featuredMediaSet) ? section.featuredMediaSet : null
  if (directMediaSet) {
    const resolved = resolveMediaSetForPlacement(directMediaSet, placement, {
      allowMigrationFallback: true,
    })
    if (resolved.url) return resolved
  }

  const featuredImage = isRecord(section.featuredImage) ? section.featuredImage : null
  if (!featuredImage) return null

  const assetMediaSet = isRecord(featuredImage.mediaSet) ? featuredImage.mediaSet : null
  if (assetMediaSet) {
    const resolved = resolveMediaSetForPlacement(assetMediaSet, placement, {
      allowMigrationFallback: true,
    })
    if (resolved.url) return resolved
  }

  const legacy = resolveLegacyAssetForPlacement(featuredImage, placement)
  return legacy.url ? legacy : null
}

export function normalizeHomepageFeaturedCandidate(
  relationTo: HomepageFeaturedCollection,
  doc: PayloadDocLike,
): HomepageFeaturedCandidate {
  const metaDescription = extractSeoExcerpt(doc)
  const author = extractAuthorPreview(doc)
  const image = resolveFeaturedPlacement(doc, 'card')
  const imageSquare = resolveFeaturedPlacement(doc, 'square-card')

  return {
    relationTo,
    id: normalizeNumericId(doc.id) ?? 0,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled',
    slug: typeof doc.slug === 'string' && doc.slug.trim() ? doc.slug : null,
    status: typeof doc.status === 'string' && doc.status.trim() ? doc.status : null,
    updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
    publishedAt:
      typeof doc.publishedAt === 'string' && doc.publishedAt.trim() ? doc.publishedAt : null,
    collectionLabel: getHomepageFeaturedCollectionLabel(relationTo),
    imageUrl: image?.url ?? null,
    imageUrlSquare: imageSquare?.url ?? null,
    image,
    imageSquare,
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
