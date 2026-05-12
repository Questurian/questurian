import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  resolveImageUrl,
  resolveInstagramPermalink,
} from '../utils/item-media.utils'
import type { RelatedItemMediaSource } from '../types'

export const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

export const asArray = (value: unknown): unknown[] | null => (
  Array.isArray(value) ? value : null
)

export const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

export const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export const isValidAbsoluteHttpUrl = (value: string): boolean => {
  if (!value.trim()) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const normalizeAbsoluteUrl = (value: unknown): string | undefined => {
  const normalized = normalizeText(value)
  if (!normalized) return undefined
  return isValidAbsoluteHttpUrl(normalized) ? normalized : undefined
}

export const toSchemaDate = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

export const getNestedValue = (source: Record<string, unknown>, path: string[]): unknown => {
  let cursor: unknown = source
  for (const part of path) {
    if (!isRecord(cursor)) return undefined
    cursor = cursor[part]
  }
  return cursor
}

export const pickFirstText = (source: Record<string, unknown>, paths: string[][]): string | undefined => {
  for (const path of paths) {
    const value = getNestedValue(source, path)
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return undefined
}

export const pickStringArray = (source: Record<string, unknown>, paths: string[][]): string[] => {
  for (const path of paths) {
    const value = getNestedValue(source, path)
    const arrayValue = asArray(value)
    if (!arrayValue) continue
    const normalized = arrayValue
      .map((entry) => normalizeText(entry))
      .filter((entry): entry is string => Boolean(entry))
    if (normalized.length > 0) return normalized
  }
  return []
}

export function extractLexicalText(value: unknown): string {
  const chunks: string[] = []

  const visit = (node: unknown) => {
    if (typeof node === 'string') {
      const normalized = node.trim()
      if (normalized) chunks.push(normalized)
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (!isRecord(node)) return

    if (typeof node.text === 'string') {
      const normalized = node.text.trim()
      if (normalized) chunks.push(normalized)
    }

    Object.values(node).forEach(visit)
  }

  visit(value)

  const deduped = chunks.filter((value, index) => chunks.indexOf(value) === index)
  return deduped.join(' ').replace(/\s+/g, ' ').trim()
}

export const extractDraftText = (markdown: string, lexicalJson?: string): string => {
  const markdownText = markdown.trim()
  if (markdownText) return markdownText

  const lexicalInput = (lexicalJson || '').trim()
  if (!lexicalInput) return ''

  try {
    const parsed = JSON.parse(lexicalInput)
    return extractLexicalText(parsed)
  } catch {
    return ''
  }
}

export const STRUCTURED_DESCRIPTION_MAX_LENGTH = 220

export const stripMarkdownSyntax = (value: string): string => (
  value
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
    .replace(/[*_~>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

export const stripPromotionalLeadIn = (value: string): string => {
  const leadInPatterns = [
    /^discover\s+/i,
    /^explore\s+/i,
    /^experience\s+/i,
    /^enjoy\s+/i,
    /^visit\s+/i,
  ]

  for (const pattern of leadInPatterns) {
    if (pattern.test(value)) {
      return value.replace(pattern, '').trim()
    }
  }

  return value
}

export const clipReadableText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value

  const sentenceCandidates = value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const sentenceFit = sentenceCandidates.find((candidate) => candidate.length <= maxLength)
  if (sentenceFit && sentenceFit.length >= Math.floor(maxLength * 0.6)) {
    return sentenceFit
  }

  const clipped = value.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  const base = (lastSpace >= Math.floor(maxLength * 0.5) ? clipped.slice(0, lastSpace) : clipped).trim()
  return base.replace(/[,:;.\-–—\s]+$/g, '')
}

export function toStructuredDescription(value: string | undefined): string | undefined {
  if (!value) return undefined

  const normalized = stripPromotionalLeadIn(stripMarkdownSyntax(value))
  if (!normalized) return undefined

  return clipReadableText(normalized, STRUCTURED_DESCRIPTION_MAX_LENGTH)
}

export const compactValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return undefined

  if (Array.isArray(value)) {
    const compactedArray = value
      .map((entry) => compactValue(entry))
      .filter((entry) => entry !== undefined)
    return compactedArray
  }

  if (!isRecord(value)) return value

  const compactedRecord = Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, compactValue(entry)])
      .filter(([, entry]) => (
        entry !== undefined
        && !(Array.isArray(entry) && entry.length < 1)
        && !(isRecord(entry) && Object.keys(entry).length < 1)
      )),
  )

  return compactedRecord
}

const PRICE_LEVEL_TO_RANGE: Record<string, string> = {
  '1': '$',
  '2': '$$',
  '3': '$$$',
  '4': '$$$$',
}

export const normalizePriceRange = (rawValue: string | undefined): string | undefined => {
  if (!rawValue) return undefined
  const trimmed = rawValue.trim()
  if (!trimmed) return undefined
  if (/^\$+$/.test(trimmed)) return trimmed
  return PRICE_LEVEL_TO_RANGE[trimmed] || trimmed
}

export function resolveEntityName(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['title'],
    ['core', 'name'],
    ['nightlifeDetails', 'core', 'name'],
  ])
}

export function resolveEntityAddress(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['address'],
    ['theDetails', 'address'],
  ])
}

export function resolveEntityWebsite(source: Record<string, unknown>): string | undefined {
  const candidate = pickFirstText(source, [
    ['website'],
    ['theDetails', 'websiteUrl'],
    ['theDetails', 'bookingUrl'],
    ['theDetails', 'googleMapsUrl'],
  ])
  return candidate ? normalizeAbsoluteUrl(candidate) : undefined
}

export function resolveEntityPhone(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['phoneNumber'],
    ['theDetails', 'phone'],
  ])
}

export function resolveEntityPriceRange(source: Record<string, unknown>): string | undefined {
  const candidate = pickFirstText(source, [
    ['priceLevel'],
    ['core', 'price'],
    ['nightlifeDetails', 'core', 'priceTier'],
    ['attractionsDetails', 'core', 'pricing'],
  ])
  return normalizePriceRange(candidate)
}

export function resolveEntityTypeLabel(source: Record<string, unknown>): string | undefined {
  return pickFirstText(source, [
    ['type'],
    ['core', 'type'],
    ['core', 'clubType'],
    ['attractionsDetails', 'core', 'attractionType'],
  ])
}

export function resolveEntityGeo(source: Record<string, unknown>): Record<string, unknown> | undefined {
  const latitude = toFiniteNumber(source.latitude)
  const longitude = toFiniteNumber(source.longitude)
  if (latitude === undefined || longitude === undefined) return undefined

  return {
    '@type': 'GeoCoordinates',
    latitude,
    longitude,
  }
}

type SelectableMediaItem = {
  selectedPhotos: number[]
  selectedInstagramPost: number | null
}

export function resolveSelectedImageUrl(
  selectable: SelectableMediaItem,
  relatedItem: RelatedItemMediaSource,
): string | undefined {
  const photoById = new Map<number, string>()
  getRelatedPhotoObjects(relatedItem).forEach((photo) => {
    const url = resolveImageUrl(photo)
    if (!url) return
    photoById.set(photo.id, url)
  })

  for (const photoId of selectable.selectedPhotos) {
    const selected = photoById.get(photoId)
    if (selected) return selected
  }

  for (const candidate of photoById.values()) {
    return candidate
  }

  return undefined
}

export function resolveSelectedInstagramPermalink(
  selectable: SelectableMediaItem,
  relatedItem: RelatedItemMediaSource,
): string | undefined {
  if (!selectable.selectedInstagramPost) return undefined
  const selectedPost = getRelatedInstagramPostObjects(relatedItem)
    .find((post) => post.id === selectable.selectedInstagramPost)
  if (!selectedPost) return undefined
  return resolveInstagramPermalink(selectedPost)
}

export function serializeStructuredDataTemplate(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

export const getNodeType = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  const typeArray = asArray(value)
  if (!typeArray || typeArray.length < 1) return null
  const first = typeArray[0]
  return typeof first === 'string' ? first : null
}
