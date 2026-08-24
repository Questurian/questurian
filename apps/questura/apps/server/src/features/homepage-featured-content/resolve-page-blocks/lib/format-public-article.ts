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
    return name ? { id: null, slug: null, name } : null
  }

  // Accepts either the already-flattened preview (`name`) or a raw Authors doc
  // (`displayName`); the byline no longer carries account name parts.
  const name = stringOrNull(value.name) ?? stringOrNull(value.displayName)
  const avatar = formatPublicAuthorAvatar(value)

  const author = {
    id: normalizeNumericId(value.id),
    slug: stringOrNull(value.slug),
    name,
    ...(avatar ? { avatar } : {}),
  }

  return author.id !== null || author.name ? author : null
}

function formatPublicAuthorAvatar(
  value: Record<string, unknown>,
): NonNullable<PublicPreviewPerson['avatar']> | null {
  const nested = isRecord(value.avatar) ? value.avatar : null
  const url = stringOrNull(nested?.url) ?? stringOrNull(nested?.bunny_original_url)
  if (!url) return null

  return {
    url,
    alt: stringOrNull(nested?.alt) ?? stringOrNull(nested?.alt_text),
  }
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

function buildArticlePath(
  item: Record<string, unknown>,
  location?: LocationContext,
): string | null {
  const relationTo = stringOrNull(item.relationTo)
  const slug = stringOrNull(item.slug)
  const canonicalPath = stringOrNull(item.canonicalPath)

  if (relationTo === 'articles') {
    return canonicalPath
  }

  const locationParts = stringOrNull(item.locationKey)?.split('|').filter(Boolean)
  const routeLocation =
    location ??
    (locationParts && locationParts.length >= 2
      ? { country: locationParts[0], city: locationParts[1] }
      : null)
  if (!slug || !routeLocation) return null

  if (relationTo === 'single-type-listicles') {
    return `/${routeLocation.country}/${routeLocation.city}/maps/${slug}`
  }

  if (relationTo === 'listicle-itineraries') {
    return `/${routeLocation.country}/${routeLocation.city}/itineraries/${slug}`
  }

  return null
}

export function formatPublicArticleItem(
  value: unknown,
  location?: LocationContext,
): PublicArticleItem {
  const item = isRecord(value) ? value : {}
  const category = formatPublicCategory(item.category)
  const image = formatPublicImage(item.image)
  const imageSquare = formatPublicImage(item.imageSquare)
  const imageWide = formatPublicImage(item.imageWide)
  const imageHero = formatPublicImage(item.imageHero)
  const articlePath = buildArticlePath(item, location)

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
    ...(imageWide ? { imageWide } : {}),
    ...(imageHero ? { imageHero } : {}),
    ...(articlePath ? { articlePath } : {}),
  }
}
