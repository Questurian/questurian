import type {
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

export function formatPublicArticleItem(value: unknown): PublicArticleItem {
  const item = isRecord(value) ? value : {}
  const category = formatPublicCategory(item.category)

  return {
    title: stringOrNull(item.title) ?? 'Untitled',
    articleType: formatPublicArticleType(item, category),
    excerpt: stringOrNull(item.excerpt) ?? stringOrNull(item.metaDescription),
    author: formatPublicAuthor(item.author, item.authorLabel),
    category,
    imageUrl: stringOrNull(item.imageUrl),
    imageUrlSquare: stringOrNull(item.imageUrlSquare),
  }
}
