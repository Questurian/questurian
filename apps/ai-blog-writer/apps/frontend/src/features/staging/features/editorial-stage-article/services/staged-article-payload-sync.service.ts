import { createEmptySeoSection, normalizeSeoSection } from '../../../../../shared/seo/services/seo-section.service'
import {
  buildDraftPayloadSyncSignature,
  normalizeNumberSet,
  normalizeText,
  sortKeysDeep,
} from '../../../../../shared/payloadSync/draftPayloadSync'
import type { ContentBlock, EditorialBlock, StagedArticle } from '../../../types'

export function hasPayloadArticleIdentity(article: StagedArticle): boolean {
  return typeof article.payloadArticleId === 'number' && Number.isFinite(article.payloadArticleId)
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

function contentBlockSyncShape(block: ContentBlock): Record<string, unknown> {
  return {
    type: block.type,
    content: normalizeText(block.content),
    imageAfter: block.imageAfter ?? null,
    imageAfterAltText: normalizeText(block.imageAfterAltText),
    imgPairAfter: block.imgPairAfter
      ? {
          imageOne: block.imgPairAfter.imageOne,
          imageTwo: block.imgPairAfter.imageTwo,
          caption: normalizeText(block.imgPairAfter.caption),
        }
      : null,
    imgTrioAfter: block.imgTrioAfter
      ? {
          format: block.imgTrioAfter.format,
          imageOne: block.imgTrioAfter.imageOne,
          imageTwo: block.imgTrioAfter.imageTwo,
          imageThree: block.imgTrioAfter.imageThree,
          caption: normalizeText(block.imgTrioAfter.caption),
        }
      : null,
  }
}

function editorialBlockSyncShape(block: EditorialBlock): Record<string, unknown> {
  return {
    component: block.component,
    label: normalizeText(block.label),
    markdown: normalizeText(block.markdown),
    afterBlockId: block.afterBlockId ?? null,
    placeAfterImage: Boolean(block.placeAfterImage),
  }
}

export function buildStagedArticlePayloadComparableShape(article: StagedArticle): Record<string, unknown> {
  const seoSection = normalizeSeoSection(article.seoSection ?? createEmptySeoSection())

  return {
    title: normalizeText(article.title),
    payloadSlug: normalizeText(article.payloadSlug),
    locationId: article.locationId ?? null,
    sharedNeighborhoods: normalizeNumberSet(article.sharedNeighborhoods),
    featuredImageId: article.featuredImageId ?? null,
    blocks: article.blocks.map(contentBlockSyncShape),
    editorialBlocks: article.editorialBlocks.map(editorialBlockSyncShape),
    seoSection: {
      ...seoSection,
      structuredData: normalizeStructuredData(seoSection.structuredData),
    },
  }
}

export function buildStagedArticlePayloadSyncSignature(article: StagedArticle): string {
  return buildDraftPayloadSyncSignature(article, buildStagedArticlePayloadComparableShape)
}
