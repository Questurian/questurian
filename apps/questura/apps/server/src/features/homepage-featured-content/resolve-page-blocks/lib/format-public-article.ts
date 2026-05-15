import type {
  PublicImage,
  PublicArticleItem,
  PublicPreviewCategory,
  PublicPreviewPerson,
} from '../types'

import { isRecord } from './guards'
import { normalizeNumericId, stringOrNull } from './normalize'

export function formatPublicAuthor(
  value: unknown,
  fallbackName: unknown,
): PublicPreviewPerson | null {
  if (!isRecord(value)) {
    const name = stringOrNull(fallbackName)
    return name ? { id: null, name, firstName: null, lastName: null } : null
  }

  const firstName = stringOrNull(value.firstName)
  const lastName = stringOrNull(value.lastName)
  const derivedName = [firstName, lastName].filter(Boolean).join(' ')
  const name = stringOrNull(value.name) ?? (derivedName || null)

  const author = {
    id: normalizeNumericId(value.id),
    name,
    firstName,
    lastName,
  }

  return author.id !== null || author.name || author.firstName || author.lastName ? author : null
}

export function formatPublicCategory(value: unknown): PublicPreviewCategory | null {
  if (!isRecord(value)) {
    return null
  }

  const category = {
    id: normalizeNumericId(value.id),
    name: stringOrNull(value.name),
    slug: stringOrNull(value.slug),
  }

  return category.id !== null || category.name || category.slug ? category : null
}

export function formatPublicArticleType(
  item: Record<string, unknown>,
  category: PublicPreviewCategory | null,
): string | null {
  const relationTo = stringOrNull(item.relationTo)

  if (relationTo === 'single-type-listicles') {
    return 'Questurian Maps'
  }

  if (relationTo === 'listicle-itineraries') {
    return 'Itinerary'
  }

  if (relationTo === 'articles') {
    return category?.name ?? 'Standard Article'
  }

  return category?.name ?? stringOrNull(item.collectionLabel)
}

function formatPublicImage(value: unknown): PublicImage | null {
  if (!isRecord(value)) return null

  const url = stringOrNull(value.url)
  if (!url) return null

  return {
    url,
    alt: stringOrNull(value.alt) ?? '',
    width: normalizeNumericId(value.width),
    height: normalizeNumericId(value.height),
    variant: stringOrNull(value.variant),
    status: stringOrNull(value.status) ?? 'missing',
  }
}

type LocationContext = { country: string; city: string }

function buildArticlePath(item: Record<string, unknown>, location?: LocationContext): string | null {
  const relationTo = stringOrNull(item.relationTo)
  const slug = stringOrNull(item.slug)

  if (relationTo === 'articles') {
    return stringOrNull(item.canonicalPath)
  }

  if (!slug || !location) return null

  if (relationTo === 'single-type-listicles') {
    return `/${location.country}/${location.city}/maps/${slug}`
  }

  if (relationTo === 'listicle-itineraries') {
    return `/${location.country}/${location.city}/itineraries/${slug}`
  }

  return null
}

export function formatPublicArticleItem(value: unknown, location?: LocationContext): PublicArticleItem {
  const item = isRecord(value) ? value : {}
  const category = formatPublicCategory(item.category)
  const image = formatPublicImage(item.image)
  const imageSquare = formatPublicImage(item.imageSquare)

  return {
    title: stringOrNull(item.title) ?? 'Untitled',
    articleType: formatPublicArticleType(item, category),
    excerpt: stringOrNull(item.excerpt) ?? stringOrNull(item.metaDescription),
    author: formatPublicAuthor(item.author, item.authorLabel),
    category,
    imageUrl: stringOrNull(item.imageUrl) ?? image?.url ?? null,
    imageUrlSquare: stringOrNull(item.imageUrlSquare) ?? imageSquare?.url ?? null,
    image,
    imageSquare,
    articlePath: buildArticlePath(item, location),
  }
}
