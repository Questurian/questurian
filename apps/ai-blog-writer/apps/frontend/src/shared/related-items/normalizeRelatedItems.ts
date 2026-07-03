import { formatLocationLabel } from '../locationScope/labels'

type RelatedItemLike = {
  id: number
  title: string
  location?: string
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const readText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

const getNestedText = (
  source: Record<string, unknown>,
  path: string[],
): string | undefined => {
  let cursor: unknown = source

  for (const key of path) {
    const record = asRecord(cursor)
    if (!record) return undefined
    cursor = record[key]
  }

  return readText(cursor)
}

const formatLocationDisplay = (value: string): string => (
  value.includes('|')
    ? formatLocationLabel({ locationKey: value })
    : value
)

const resolveLocationDisplay = (source: Record<string, unknown>): string | undefined => {
  const locationText = readText(source.location)
    || readText(source.locationKey)

  return locationText ? formatLocationDisplay(locationText) : undefined
}

const resolveTitleDisplay = (
  source: Record<string, unknown>,
  fallbackLocation?: string,
): string => (
  readText(source.title)
  || getNestedText(source, ['sourceName'])
  || getNestedText(source, ['name'])
  || getNestedText(source, ['core', 'name'])
  || getNestedText(source, ['nightlifeDetails', 'core', 'name'])
  || fallbackLocation
  || `Item #${String(source.id ?? '').trim() || 'unknown'}`
)

export function getRelatedItemDisplayLabel<T extends RelatedItemLike>(
  item: T | null | undefined,
): string {
  if (!item) return ''

  const title = readText(item.title)
  if (title) return title

  const location = readText(item.location)
  if (location) return formatLocationDisplay(location)

  return `Item #${item.id}`
}

export function normalizeRelatedItem<T extends RelatedItemLike>(item: T): T {
  const source = asRecord(item)
  if (!source) return item

  const location = resolveLocationDisplay(source)
  const title = resolveTitleDisplay(source, location)

  return {
    ...item,
    title,
    location: location || item.location,
  }
}

export function normalizeRelatedItems<T extends RelatedItemLike>(items: T[]): T[] {
  return items.map((item) => normalizeRelatedItem(item))
}
