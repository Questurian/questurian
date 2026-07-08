/**
 * Imports an article stored in Payload CMS into the staged-article model used
 * by the shared stage builder, so any Payload document can be edited with the
 * same block editor regardless of which pipeline (if any) created it.
 */
import type { PayloadArticleDoc } from '../../../api/articles/articles.types'
import type { ContentBlock, EditorialBlock, StagedArticle } from '../../../types'
import { normalizeSeoSection } from '../../../../../shared/seo/services/seo-section.service'
import {
  DEFAULT_EDITOR_MODEL_NAME,
  FAQ_COMPONENT,
  FAQ_LABEL,
  HIGHLIGHT_CALLOUT_COMPONENT,
  HIGHLIGHT_CALLOUT_LABEL,
  IN_THE_KNOW_COMPONENT,
  IN_THE_KNOW_LABEL,
  KEY_TAKEAWAYS_COMPONENT,
  KEY_TAKEAWAYS_LABEL,
  PULL_QUOTE_COMPONENT,
  PULL_QUOTE_LABEL,
} from '../constants'
import {
  createImgPairBlock,
  createImgTrioBlock,
  createSingleImageBlock,
} from '../content-blocks/block-media'
import {
  buildCanonicalFAQMarkdown,
  buildCanonicalHighlightCalloutMarkdown,
  buildCanonicalInTheKnowMarkdown,
  buildCanonicalKeyTakeawaysMarkdown,
  buildCanonicalPullQuoteMarkdown,
} from '../editorial-markdown.service'
import { composeArticleMarkdown } from '../editorial-placement/article-composition'
import { buildPayloadArticleMetadataPatch } from './payload-article-metadata.service'
import { markDraftAsPayloadSynced } from '../../../../../shared/payloadSync/draftPayloadSync'
import {
  buildStagedArticlePayloadComparableShape,
  hasPayloadArticleIdentity,
} from './staged-article-payload-sync.service'

export type PayloadArticleDetail = PayloadArticleDoc & {
  location?: string | null
  locationRef?: number | { id?: number } | null
  sharedNeighborhoods?: Array<number | { id?: number }> | null
  headerSection?: {
    featuredImage?: number | { id?: number } | null
  } | null
  contentBlocks?: Array<Record<string, unknown>> | null
  seoSection?: unknown
}

type ConvertLexicalToMarkdown = (lexical: object) => Promise<{
  success: boolean
  markdown?: string
  error?: string
}>

function relationId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return undefined
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export const PAYLOAD_IMPORT_STAGED_ID_PREFIX = 'payload_doc_'

export function buildPayloadImportStagedId(articleId: number): string {
  return `${PAYLOAD_IMPORT_STAGED_ID_PREFIX}${articleId}`
}

export async function buildStagedArticleFromPayloadDoc(input: {
  doc: PayloadArticleDetail
  convertLexicalToMarkdown: ConvertLexicalToMarkdown
  fallbackAuthorName?: string
}): Promise<StagedArticle> {
  const { doc, convertLexicalToMarkdown, fallbackAuthorName } = input

  const blocks: ContentBlock[] = []
  const editorialBlocks: EditorialBlock[] = []
  let lastAnchorBlockId: string | null = null

  const pushEditorial = (component: string, label: string, markdown: string, index: number) => {
    editorialBlocks.push({
      id: `editorial_payload_${index}`,
      component,
      label,
      markdown,
      afterBlockId: lastAnchorBlockId,
    })
  }

  const contentBlocks = Array.isArray(doc.contentBlocks) ? doc.contentBlocks : []

  for (const [index, rawBlock] of contentBlocks.entries()) {
    const blockType = asText(rawBlock.blockType)
    const blockId = `block_payload_${index}`

    if (blockType === 'text') {
      const lexical = rawBlock.content
      if (!lexical || typeof lexical !== 'object') continue
      const result = await convertLexicalToMarkdown(lexical as object)
      if (!result.success || typeof result.markdown !== 'string') {
        throw new Error(result.error || `Failed to convert text block ${index + 1} to markdown`)
      }
      blocks.push({ id: blockId, type: 'text', content: result.markdown.trim() })
      lastAnchorBlockId = blockId
      continue
    }

    if (blockType === 'image') {
      const imageId = relationId(rawBlock.image)
      if (!imageId) continue
      blocks.push(createSingleImageBlock(blockId, imageId, asText(rawBlock.altText) || undefined))
      lastAnchorBlockId = blockId
      continue
    }

    if (blockType === 'img-pair') {
      const imageOne = relationId(rawBlock.imageOne)
      const imageTwo = relationId(rawBlock.imageTwo)
      if (!imageOne || !imageTwo) continue
      blocks.push(createImgPairBlock(blockId, imageOne, imageTwo, asText(rawBlock.caption) || undefined))
      lastAnchorBlockId = blockId
      continue
    }

    if (blockType === 'img-trio') {
      const imageOne = relationId(rawBlock.imageOne)
      const imageTwo = relationId(rawBlock.imageTwo)
      const imageThree = relationId(rawBlock.imageThree)
      if (!imageOne || !imageTwo || !imageThree) continue
      const format = rawBlock.format === 'landscape' ? 'landscape' : 'square'
      blocks.push(createImgTrioBlock(blockId, format, imageOne, imageTwo, imageThree, asText(rawBlock.caption) || undefined))
      lastAnchorBlockId = blockId
      continue
    }

    if (blockType === 'key-takeaway') {
      const items = Array.isArray(rawBlock.items)
        ? rawBlock.items.map((item) => asText((item as Record<string, unknown>)?.text))
        : []
      pushEditorial(
        KEY_TAKEAWAYS_COMPONENT,
        asText(rawBlock.label) || KEY_TAKEAWAYS_LABEL,
        buildCanonicalKeyTakeawaysMarkdown(asText(rawBlock.label) || KEY_TAKEAWAYS_LABEL, items, { useFallbackItems: false }),
        index,
      )
      continue
    }

    if (blockType === 'pull-quote') {
      pushEditorial(
        PULL_QUOTE_COMPONENT,
        PULL_QUOTE_LABEL,
        buildCanonicalPullQuoteMarkdown(PULL_QUOTE_LABEL, asText(rawBlock.quote), { useFallbackQuote: false }),
        index,
      )
      continue
    }

    if (blockType === 'in-the-know') {
      pushEditorial(
        IN_THE_KNOW_COMPONENT,
        asText(rawBlock.label) || IN_THE_KNOW_LABEL,
        buildCanonicalInTheKnowMarkdown(asText(rawBlock.label) || IN_THE_KNOW_LABEL, asText(rawBlock.text), { useFallbackText: false }),
        index,
      )
      continue
    }

    if (blockType === 'highlight-callout') {
      pushEditorial(
        HIGHLIGHT_CALLOUT_COMPONENT,
        asText(rawBlock.label) || HIGHLIGHT_CALLOUT_LABEL,
        buildCanonicalHighlightCalloutMarkdown(asText(rawBlock.label) || HIGHLIGHT_CALLOUT_LABEL, asText(rawBlock.text), { useFallbackText: false }),
        index,
      )
      continue
    }

    if (blockType === 'faq') {
      const items = Array.isArray(rawBlock.items)
        ? rawBlock.items.map((item) => ({
            question: asText((item as Record<string, unknown>)?.question),
            answer: asText((item as Record<string, unknown>)?.answer),
          }))
        : []
      pushEditorial(
        FAQ_COMPONENT,
        asText(rawBlock.label) || FAQ_LABEL,
        buildCanonicalFAQMarkdown(asText(rawBlock.label) || FAQ_LABEL, items, { useFallbackItems: false }),
        index,
      )
    }
  }

  const content = composeArticleMarkdown(blocks, editorialBlocks)
  const now = new Date().toISOString()
  const title = doc.title || 'Untitled Article'
  const sharedNeighborhoods = Array.isArray(doc.sharedNeighborhoods)
    ? doc.sharedNeighborhoods
        .map((entry) => relationId(entry))
        .filter((id): id is number => typeof id === 'number')
    : []

  const stagedArticle: StagedArticle = {
    id: buildPayloadImportStagedId(doc.id),
    runId: '',
    originalTitle: title,
    originalContent: content,
    originalType: 'payload',
    title,
    content,
    blocks,
    editorialBlocks,
    locationId: relationId(doc.locationRef),
    sharedNeighborhoods,
    editorModelName: DEFAULT_EDITOR_MODEL_NAME,
    featuredImageId: relationId(doc.headerSection?.featuredImage),
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: true,
    step3_in_update_mode: false,
    seoSection: normalizeSeoSection(doc.seoSection),
    syncBehavior: 'draft-sync',
    lexicalConverted: true,
    ...buildPayloadArticleMetadataPatch({ doc, fallbackAuthorName }),
    publishedToPayload: true,
    createdAt: now,
    updatedAt: now,
  }

  return markDraftAsPayloadSynced(
    stagedArticle,
    buildStagedArticlePayloadComparableShape,
    doc.updatedAt || now,
    { hasPayloadIdentity: hasPayloadArticleIdentity },
  )
}
