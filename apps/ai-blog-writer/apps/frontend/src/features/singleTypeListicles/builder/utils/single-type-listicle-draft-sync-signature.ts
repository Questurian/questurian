import { lexicalRichTextToMarkdown } from '../../../../shared/builder/utils/lexical-json.utils'
import {
  buildDraftPayloadSyncSignature,
  normalizeNumberSet,
  normalizeText,
  sortKeysDeep,
} from '../../../../shared/payloadSync/payloadSyncSignature'
import { normalizeSeoSection } from '../services/seo-section.service'
import type { ListicleItemBlock, PayloadRichText, SingleTypeListicleDraft } from '../../types'

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

function normalizeStructuredData(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    return sortKeysDeep(JSON.parse(trimmed))
  } catch {
    return trimmed
  }
}

function itemSyncShape(item: ListicleItemBlock): Record<string, unknown> {
  return {
    blockType: item.blockType,
    item: item.item ?? null,
    tours: item.tours,
    mediaMode: item.mediaMode,
    selectedPhotos: item.selectedPhotos,
    selectedInstagramPost: item.selectedInstagramPost ?? null,
    angle: item.angle ?? null,
    blurbMarkdown: normalizeRichTextMarkdown(item.blurbMarkdown, item.blurbJsonText, item.blurbLexical),
  }
}

export function buildSingleTypeListicleDraftComparableShape(
  draft: SingleTypeListicleDraft,
): Record<string, unknown> {
  const seoSection = normalizeSeoSection(draft.seoSection)

  return {
    title: normalizeText(draft.title),
    payloadSlug: normalizeText(draft.payloadSlug),
    location: normalizeText(draft.location),
    sharedNeighborhoods: normalizeNumberSet(draft.sharedNeighborhoods),
    listicleType: draft.listicleType,
    targetItemCount: draft.targetItemCount,
    listTone: draft.listTone,
    header: {
      introMarkdown: normalizeRichTextMarkdown(
        draft.header.introMarkdown,
        draft.header.introJsonText,
        draft.header.introLexical,
      ),
      featuredMediaSet: draft.header.featuredMediaSet ?? null,
      featuredImage: draft.header.featuredImage ?? null,
    },
    items: draft.items.map(itemSyncShape),
    seoSection: {
      ...seoSection,
      structuredData: normalizeStructuredData(seoSection.structuredData),
    },
  }
}

export function buildSingleTypeListicleDraftSyncSignature(
  draft: SingleTypeListicleDraft,
): string {
  return buildDraftPayloadSyncSignature(draft, buildSingleTypeListicleDraftComparableShape)
}
