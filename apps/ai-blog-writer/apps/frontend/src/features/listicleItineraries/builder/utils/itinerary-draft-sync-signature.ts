import { normalizeSeoSection } from '../services/seo-section.service'
import type { ItineraryItemBlock, ListicleItineraryDraft, PayloadRichText } from '../../types'
import { lexicalRichTextToMarkdown } from '../../../../shared/builder/utils/lexical-json.utils'

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNumberSet(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))]
    .sort((a, b) => a - b)
}

function normalizeRichTextMarkdown(
  markdown: string | undefined,
  jsonText: string | undefined,
  lexical: PayloadRichText | undefined,
): string {
  const markdownText = normalizeText(markdown)
  if (markdownText) return markdownText

  if (jsonText?.trim()) {
    try {
      const parsed = JSON.parse(jsonText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return lexicalRichTextToMarkdown(parsed as PayloadRichText)
      }
    } catch {
      return jsonText.trim()
    }
  }

  return lexicalRichTextToMarkdown(lexical)
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortKeysDeep(entry)]),
  )
}

function normalizeStructuredData(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const parsed = JSON.parse(trimmed)
    return sortKeysDeep(parsed)
  } catch {
    return trimmed
  }
}

function itemSyncShape(item: ItineraryItemBlock): Record<string, unknown> {
  return {
    blockType: item.blockType,
    item: item.item ?? null,
    // Tour Picks are ordered, so no set-normalization here.
    tours: item.tours,
    mediaMode: item.mediaMode,
    selectedPhotos: item.selectedPhotos,
    selectedInstagramPost: item.selectedInstagramPost ?? null,
    title: normalizeText(item.title),
    operator: normalizeText(item.operator),
    price: item.price || '',
    url: normalizeText(item.url),
    tourDuration: item.tourDuration,
    startingPoint: {
      label: normalizeText(item.startingPoint.label),
      latitude: normalizeText(item.startingPoint.latitude),
      longitude: normalizeText(item.startingPoint.longitude),
    },
    keyLocations: item.keyLocations.map((row) => ({
      source: row.source,
      relatedCollection: row.relatedCollection ?? null,
      relatedItem: row.relatedItem ?? null,
      title: normalizeText(row.title),
      latitude: normalizeText(row.latitude),
      longitude: normalizeText(row.longitude),
    })),
    image: item.image ?? null,
    instagramPost: item.instagramPost ?? null,
    blurbMarkdown: normalizeRichTextMarkdown(item.blurbMarkdown, item.blurbJsonText, item.blurbLexical),
  }
}

export function buildItineraryDraftSyncSignature(draft: ListicleItineraryDraft): string {
  const seoSection = normalizeSeoSection(draft.seoSection)
  const dayCount = Math.max(1, Math.min(7, Math.floor(draft.dayCount || draft.days.length || 1)))

  return JSON.stringify(sortKeysDeep({
    title: normalizeText(draft.title),
    payloadSlug: normalizeText(draft.payloadSlug),
    location: normalizeText(draft.location),
    sharedNeighborhoods: normalizeNumberSet(draft.sharedNeighborhoods),
    header: {
      introMarkdown: normalizeRichTextMarkdown(
        draft.header.introMarkdown,
        draft.header.introJsonText,
        draft.header.introLexical,
      ),
      featuredMediaSet: draft.header.featuredMediaSet ?? null,
      featuredImage: draft.header.featuredImage ?? null,
    },
    dayCount,
    days: draft.days.slice(0, dayCount).map((day) => ({
      whereStaying: day.whereStaying.map(itemSyncShape),
      items: day.items.map(itemSyncShape),
    })),
    seoSection: {
      ...seoSection,
      structuredData: normalizeStructuredData(seoSection.structuredData),
    },
  }))
}
