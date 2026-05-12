import type {
  ListicleItemBlock,
  RelatedItemOption,
  SingleTypeListicleDraft,
} from '../../types'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  resolveImageUrl,
  resolveInstagramPermalink,
} from '../../../shared/builder/utils/item-media.utils'

const LISTICLE_BLOCK_LABELS: Record<ListicleItemBlock['blockType'], string> = {
  'data-dining': 'Dining',
  'data-accommodations': 'Accommodations',
  'data-attractions': 'Attractions',
  'data-nightlife': 'Nightlife',
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

function buildSection(label: string, content: string): string | null {
  const normalizedContent = content.trim()
  if (!normalizedContent) return null
  return `### ${label}\n${normalizedContent}`
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function getNestedValue(record: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = record
  for (const part of path) {
    const current = asRecord(cursor)
    if (!current) return undefined
    cursor = current[part]
  }
  return cursor
}

function extractLexicalText(value: unknown): string {
  const parts: string[] = []

  const visit = (node: unknown) => {
    if (typeof node === 'string') {
      const normalized = node.trim()
      if (normalized) parts.push(normalized)
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    const record = asRecord(node)
    if (!record) return

    if (typeof record.text === 'string') {
      const normalized = record.text.trim()
      if (normalized) parts.push(normalized)
    }

    Object.values(record).forEach(visit)
  }

  visit(value)

  const deduped = parts.filter((part, index) => parts.indexOf(part) === index)
  return deduped.join(' ').replace(/\s+/g, ' ').trim()
}

function extractDraftText(markdown: string, jsonText?: string): string {
  const markdownText = markdown.trim()
  if (markdownText) return markdownText

  const lexicalInput = (jsonText || '').trim()
  if (!lexicalInput) return ''

  try {
    const parsed = JSON.parse(lexicalInput)
    return extractLexicalText(parsed)
  } catch {
    return ''
  }
}

function resolveFirstText(
  relatedItem: Record<string, unknown>,
  paths: string[][],
): string | undefined {
  for (const path of paths) {
    const value = getNestedValue(relatedItem, path)
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return undefined
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function buildRelatedItemSnapshot(
  listicleItem: ListicleItemBlock,
  relatedItem: RelatedItemOption | undefined,
): Record<string, unknown> | null {
  if (!relatedItem) return null

  const raw = asRecord(relatedItem)
  if (!raw) return null

  const selectedPhotoUrls = getRelatedPhotoObjects(relatedItem)
    .filter((photo) => listicleItem.selectedPhotos.includes(photo.id))
    .map((photo) => resolveImageUrl(photo))
    .filter((url): url is string => Boolean(url))

  const selectedInstagram = getRelatedInstagramPostObjects(relatedItem)
    .find((post) => post.id === listicleItem.selectedInstagramPost)

  const snapshot: Record<string, unknown> = {
    id: relatedItem.id,
    title: relatedItem.title,
    location: relatedItem.location,
    status: relatedItem.status,
    type: resolveFirstText(raw, [['type'], ['core', 'type'], ['nightlifeDetails', 'core', 'clubType']]),
    priceLevel: resolveFirstText(raw, [['priceLevel'], ['core', 'price'], ['nightlifeDetails', 'core', 'priceTier']]),
    address: resolveFirstText(raw, [['address'], ['theDetails', 'address']]),
    website: resolveFirstText(raw, [['website'], ['theDetails', 'websiteUrl'], ['theDetails', 'bookingUrl']]),
    phone: resolveFirstText(raw, [['phoneNumber'], ['theDetails', 'phone']]),
    latitude: toFiniteNumber(raw.latitude),
    longitude: toFiniteNumber(raw.longitude),
    cuisines: Array.isArray(raw.cuisines) ? raw.cuisines : undefined,
    idealFor: Array.isArray(raw.idealFor) ? raw.idealFor : undefined,
    core: asRecord(raw.core) || asRecord(getNestedValue(raw, ['nightlifeDetails', 'core'])) || undefined,
    theStay: asRecord(raw.theStay) || undefined,
    theExperience: asRecord(raw.theExperience) || undefined,
    theDetails: asRecord(raw.theDetails) || asRecord(getNestedValue(raw, ['nightlifeDetails', 'theDetails'])) || undefined,
    attractionsDetails: asRecord(raw.attractionsDetails) || undefined,
    nightlifeDetails: asRecord(raw.nightlifeDetails) || undefined,
    selectedPhotoUrls,
    selectedInstagramPost: selectedInstagram ? {
      id: selectedInstagram.id,
      title: selectedInstagram.title,
      permalink: resolveInstagramPermalink(selectedInstagram),
    } : undefined,
  }

  const compact = Object.fromEntries(
    Object.entries(snapshot).filter(([, value]) => (
      value !== undefined
      && value !== null
      && !(Array.isArray(value) && value.length < 1)
    )),
  )

  return compact
}

export function getListicleAiArticleTitle(draft: SingleTypeListicleDraft): string {
  return draft.title.trim() || 'Untitled listicle'
}

export function buildListicleAiArticleContext(
  draft: SingleTypeListicleDraft,
  relatedItems: RelatedItemOption[] = [],
): string {
  const sections: string[] = []
  const introText = extractDraftText(draft.header.introMarkdown, draft.header.introJsonText)
  const introSection = buildSection('Intro', introText)

  if (introSection) {
    sections.push(introSection)
  }

  const relatedById = new Map<number, RelatedItemOption>(
    relatedItems.map((entry) => [entry.id, entry]),
  )

  draft.items.forEach((item, index) => {
    const itemBlurb = extractDraftText(item.blurbMarkdown, item.blurbJsonText)
    const relatedItem = item.item ? relatedById.get(item.item) : undefined
    const sourceSnapshot = buildRelatedItemSnapshot(item, relatedItem)

    const detailLines = [
      itemBlurb ? `Blurb:\n${itemBlurb}` : '',
      `Media mode: ${item.mediaMode}`,
      item.selectedPhotos.length > 0 ? `Selected photos: ${item.selectedPhotos.join(', ')}` : '',
      item.selectedInstagramPost ? `Selected Instagram post ID: ${item.selectedInstagramPost}` : '',
      sourceSnapshot
        ? `Selected source snapshot:\n${JSON.stringify(sourceSnapshot, null, 2)}`
        : 'Selected source snapshot: unavailable',
    ].filter(Boolean)

    const blurbSection = buildSection(
      `Item ${index + 1}: ${LISTICLE_BLOCK_LABELS[item.blockType]}${item.item ? ` (#${item.item})` : ''}`,
      detailLines.join('\n\n'),
    )

    if (blurbSection) {
      sections.push(blurbSection)
    }
  })

  return sections.join('\n\n').trim()
}
