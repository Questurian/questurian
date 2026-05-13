import { HOMEPAGE_FEATURED_CONTENT_COLLECTIONS } from '../types'
import type {
  HomepageFeaturedCollection,
  HomepageFeaturedItemRef,
  ParsedHomepageFeaturedSlot,
} from '../types'

import { isRecord, normalizeNumericId } from './candidate'

export function isHomepageFeaturedCollection(
  value: unknown,
): value is HomepageFeaturedCollection {
  return (
    typeof value === 'string' &&
    HOMEPAGE_FEATURED_CONTENT_COLLECTIONS.includes(value as HomepageFeaturedCollection)
  )
}

export function buildHomepageFeaturedKey(ref: HomepageFeaturedItemRef): string {
  return `${ref.relationTo}:${ref.id}`
}

export function normalizeHomepageFeaturedRef(value: unknown): HomepageFeaturedItemRef | null {
  if (!isRecord(value)) return null

  const relationTo = value.relationTo
  if (!isHomepageFeaturedCollection(relationTo)) {
    return null
  }

  const directId = normalizeNumericId(value.id)
  if (directId !== null) {
    return {
      relationTo,
      id: directId,
    }
  }

  const nestedValue = value.value
  if (isRecord(nestedValue)) {
    const nestedId = normalizeNumericId(nestedValue.id)
    if (nestedId !== null) {
      return {
        relationTo,
        id: nestedId,
      }
    }
  }

  const valueId = normalizeNumericId(nestedValue)
  if (valueId !== null) {
    return {
      relationTo,
      id: valueId,
    }
  }

  return null
}

export function normalizeHomepageFeaturedInput(rawItems: unknown): HomepageFeaturedItemRef[] {
  if (!Array.isArray(rawItems)) return []

  const refs = rawItems.map((item) => normalizeHomepageFeaturedRef(item))

  if (refs.some((item) => item === null)) {
    throw new Error(
      'Homepage featured content items must use supported collections and numeric ids.',
    )
  }

  return refs as HomepageFeaturedItemRef[]
}

export function parseHomepageFeaturedSlots(rawItems: unknown): ParsedHomepageFeaturedSlot[] {
  if (!Array.isArray(rawItems)) return []

  return rawItems.map((rawItem, index) => {
    const ref = normalizeHomepageFeaturedRef(rawItem)

    return {
      slot: index + 1,
      ref,
      reason: ref ? null : 'invalid_reference',
    }
  })
}

export function buildHomepageFeaturedGlobalData(items: HomepageFeaturedItemRef[]) {
  return {
    items: items.map((item) => ({
      relationTo: item.relationTo,
      value: item.id,
    })),
  }
}
