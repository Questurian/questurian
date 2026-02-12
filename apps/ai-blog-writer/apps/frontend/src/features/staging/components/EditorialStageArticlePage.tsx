import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../../../providers/AuthProvider'
import { ImageUpload, type UploadImageResponse } from '../../../features/images'
import '../../youtube2blog/styles/stage-article.css'
import type { CreateArticlePayload, Location, MediaAsset } from '../api'
import type { ContentBlock, EditorialBlock, StagedArticle } from '../types'

type MediaVariant =
  | 'thumbnail'
  | 'square'
  | 'wide'
  | 'portrait'
  | 'hero'
  | 'open_graph'
  | 'editorial'
type BlockImageModalMode = 'default' | 'img' | 'img-trio'
type ImgTrioFormat = 'square' | 'landscape'

const CONTENT_BLOCK_VARIANT: MediaVariant = 'wide'
const IMG_BLOCK_VARIANT: MediaVariant = 'portrait'
const FEATURED_IMAGE_VARIANT: MediaVariant = 'editorial'
const CONTENT_BLOCK_WIDTH = 1920
const CONTENT_BLOCK_HEIGHT = 1080
const FEATURED_IMAGE_WIDTH = 1600
const FEATURED_IMAGE_HEIGHT = 1200
const IMG_BLOCK_MIN_WIDTH = 1200
const IMG_BLOCK_MIN_HEIGHT = 1500
const IMG_PAIR_REQUIRED_IMAGE_COUNT = 2
const IMG_TRIO_REQUIRED_IMAGE_COUNT = 3
const IMG_TRIO_DEFAULT_FORMAT: ImgTrioFormat = 'square'
const IMG_TRIO_DIMENSIONS: Record<ImgTrioFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
}

const VARIANT_FALLBACK_ORDER: MediaVariant[] = [
  'wide',
  'hero',
  'square',
  'portrait',
  'thumbnail',
]

type EditorialStageArticleApi = {
  fetchLocations: (
    token?: string,
    params?: { limit?: number; page?: number }
  ) => Promise<{ docs: Location[]; totalDocs: number; totalPages: number }>
  fetchMediaAssets: (
    token?: string,
    params?: {
      limit?: number
      mimeType?: string
      minWidth?: number
      minHeight?: number
      width?: number
      height?: number
    }
  ) => Promise<{ docs: MediaAsset[]; totalDocs: number }>
  createArticle: (
    payload: CreateArticlePayload,
    token: string
  ) => Promise<{ id: number; title: string; slug: string }>
  convertMarkdownToLexical: (markdown: string) => Promise<{
    success: boolean
    data?: object
    error?: string
  }>
  fetchResult: (runId: string) => Promise<{ markdown: string }>
  markArticleSynced: (
    runId: string,
    payloadArticleId: number
  ) => Promise<{ message: string; run_id: string; payload_article_id: number }>
}

type EditorialStageRoutes = {
  stagePath: string
  stageArticlePath: string
  articlesPath: string
}

type EditorialStageArticlePageProps = {
  storageKey: string
  routes: EditorialStageRoutes
  api: EditorialStageArticleApi
}

type BlockImageModalState = {
  blockId: string
  show: boolean
  mode: BlockImageModalMode
  replaceExistingBlock?: boolean
}

type OpenBlockImageModalOptions = {
  caption?: string
  trioFormat?: ImgTrioFormat
  selectedAssetIds?: number[]
  replaceExistingBlock?: boolean
}

function buildImageFileNamePrefix(articleTitle: string, externalRef: string): string {
  const slugify = (value: string): string => {
    const normalized = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    return normalized
  }

  const stableHash = (value: string): string => {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash +=
        (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }
    return (hash >>> 0).toString(36).slice(0, 4)
  }

  const titleSlug = slugify(articleTitle)
  const titlePart = (titleSlug.split('-')[0] || 'image').slice(0, 16)
  const numericToken = (externalRef.match(/\d+/g)?.[0] || '').slice(-6)
  const hashToken = stableHash(externalRef)
  const idPart = numericToken
    ? `${numericToken}${hashToken}`
    : hashToken

  return `${titlePart}-${idPart}`
}

function extractEditorialBlocks(markdown: string): {
  bodyMarkdown: string
  editorialBlocks: EditorialBlock[]
} {
  if (!markdown) {
    return { bodyMarkdown: '', editorialBlocks: [] }
  }

  const lines = markdown.split('\n')
  const editorialBlocks: EditorialBlock[] = []
  const bodyLines: string[] = []
  const startRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-START\|([^\]]+)\]\s*$/i
  const endRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-END\|([^\]]+)\]\s*$/i
  const labelRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]\s*$/i

  let index = 0
  while (index < lines.length) {
    const startMatch = lines[index].match(startRegex)
    if (!startMatch) {
      bodyLines.push(lines[index])
      index++
      continue
    }

    const component = startMatch[1].trim()
    const blockLines = [lines[index]]
    let label = component
    let cursor = index + 1
    let foundEnd = false

    while (cursor < lines.length) {
      const line = lines[cursor]
      blockLines.push(line)

      const labelMatch = line.match(labelRegex)
      if (labelMatch && labelMatch[1]?.trim()) {
        label = labelMatch[1].trim()
      }

      const endMatch = line.match(endRegex)
      if (
        endMatch
        && endMatch[1]?.trim().toLowerCase() === component.toLowerCase()
      ) {
        foundEnd = true
        break
      }

      cursor++
    }

    if (!foundEnd) {
      bodyLines.push(...blockLines)
      index = cursor + 1
      continue
    }

    editorialBlocks.push({
      id: `editorial_${index}_${editorialBlocks.length}`,
      component,
      label,
      markdown: blockLines.join('\n').trim(),
      anchorLine: bodyLines.length,
      afterBlockId: null,
      placeAfterImage: false,
    })

    index = cursor + 1
  }

  return {
    bodyMarkdown: bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    editorialBlocks,
  }
}

function normalizeEditorialBlocks(
  blocks: EditorialBlock[] | undefined
): EditorialBlock[] {
  if (!blocks || !Array.isArray(blocks)) return []

  return blocks
    .map((block, index) => ({
      id: block.id || `editorial_${index}`,
      component: block.component || 'unknown',
      label: block.label || block.component || 'Editorial Block',
      markdown: block.markdown || '',
      anchorLine:
        typeof block.anchorLine === 'number' ? block.anchorLine : undefined,
      afterBlockId:
        typeof block.afterBlockId === 'string' || block.afterBlockId === null
          ? block.afterBlockId
          : undefined,
      placeAfterImage: block.placeAfterImage === true,
    }))
    .filter((block) => block.markdown.trim().length > 0)
}

const KEY_TAKEAWAYS_COMPONENT = 'key_takeaways_box'
const KEY_TAKEAWAYS_LABEL = 'Key Takeaways'
const PULL_QUOTE_COMPONENT = 'pull_quote'
const PULL_QUOTE_LABEL = 'Pull Quote'
const IN_THE_KNOW_COMPONENT = 'in_the_know_box'
const IN_THE_KNOW_LABEL = 'In The Know'
const EDITORIAL_MAX_TAKEAWAYS = 5
type SupportedEditorialComponent =
  | typeof KEY_TAKEAWAYS_COMPONENT
  | typeof PULL_QUOTE_COMPONENT
  | typeof IN_THE_KNOW_COMPONENT

const IMAGE_PICKER_OPTIONS: ReadonlyArray<{
  mode: BlockImageModalMode
  label: string
}> = [
  { mode: 'default', label: 'Single Image' },
  { mode: 'img', label: 'Img Pair (2)' },
  { mode: 'img-trio', label: 'Img Trio (3)' },
]

const EDITORIAL_PICKER_OPTIONS: ReadonlyArray<{
  component: SupportedEditorialComponent
  label: string
}> = [
  { component: PULL_QUOTE_COMPONENT, label: 'Quote' },
  { component: KEY_TAKEAWAYS_COMPONENT, label: 'Key Takeaways' },
  { component: IN_THE_KNOW_COMPONENT, label: 'In The Know' },
]

type PayloadContentBlock = NonNullable<CreateArticlePayload['contentBlocks']>[number]
type SupportedPayloadBlockType = 'key-takeaway' | 'pull-quote' | 'in-the-know'

type EditorialPublishValidation =
  | {
      status: 'supported'
      payloadBlock: PayloadContentBlock
      correctedMarkdown: string
      mappedPayloadBlockType: SupportedPayloadBlockType
    }
  | {
      status: 'invalid'
      message: string
      correctedMarkdown: string
    }
  | {
      status: 'unsupported'
      message: string
    }

type EditorialPublishAnalysis = {
  byId: Record<string, EditorialPublishValidation>
  blockingBlocks: Array<{ blockId: string; message: string }>
  hasBlockingBlocks: boolean
}

type TimelineItem =
  | {
      id: string
      type: 'content'
      contentBlockId: string
    }
  | {
      id: string
      type: 'image'
      contentBlockId: string
    }
  | {
      id: string
      type: 'editorial'
      editorialBlockId: string
    }

type NormalizeBlocksResult = {
  blocks: ContentBlock[]
  mediaBlockIdByLegacyAnchorId: Map<string, string>
}

function isStandaloneMediaBlock(block: ContentBlock): boolean {
  return block.type === 'image' || block.type === 'img-pair' || block.type === 'img-trio'
}

function isTextualBlock(block: ContentBlock): boolean {
  return block.type === 'text' || block.type === 'pullquote'
}

function createSingleImageBlock(
  id: string,
  imageId: number,
  altText?: string
): ContentBlock {
  return {
    id,
    type: 'image',
    content: '',
    imageAfter: imageId,
    imageAfterAltText: altText?.trim() || undefined,
  }
}

function createImgPairBlock(
  id: string,
  imageOne: number,
  imageTwo: number,
  caption?: string
): ContentBlock {
  return {
    id,
    type: 'img-pair',
    content: '',
    imgPairAfter: {
      imageOne,
      imageTwo,
      caption: caption?.trim() || undefined,
    },
  }
}

function createImgTrioBlock(
  id: string,
  format: ImgTrioFormat,
  imageOne: number,
  imageTwo: number,
  imageThree: number,
  caption?: string
): ContentBlock {
  return {
    id,
    type: 'img-trio',
    content: '',
    imgTrioAfter: {
      format,
      imageOne,
      imageTwo,
      imageThree,
      caption: caption?.trim() || undefined,
    },
  }
}

function getContentTimelineItemId(blockId: string): string {
  return `content:${blockId}`
}

function getImageTimelineItemId(blockId: string): string {
  return `image:${blockId}`
}

function getEditorialTimelineItemId(editorialBlockId: string): string {
  return `editorial:${editorialBlockId}`
}

type BlockMediaPayload =
  | {
      type: 'single'
      imageAfter: number
      imageAfterAltText?: string
    }
  | {
      type: 'pair'
      imgPairAfter: NonNullable<ContentBlock['imgPairAfter']>
    }
  | {
      type: 'trio'
      imgTrioAfter: NonNullable<ContentBlock['imgTrioAfter']>
    }

function getBlockMediaPayload(block: ContentBlock): BlockMediaPayload | null {
  if (block.type === 'image' && block.imageAfter != null) {
    return {
      type: 'single',
      imageAfter: block.imageAfter,
      imageAfterAltText: block.imageAfterAltText,
    }
  }

  if (block.type === 'img-pair' && block.imgPairAfter) {
    return {
      type: 'pair',
      imgPairAfter: block.imgPairAfter,
    }
  }

  if (block.type === 'img-trio' && block.imgTrioAfter) {
    return {
      type: 'trio',
      imgTrioAfter: block.imgTrioAfter,
    }
  }

  if (block.imageAfter != null) {
    return {
      type: 'single',
      imageAfter: block.imageAfter,
      imageAfterAltText: block.imageAfterAltText,
    }
  }

  if (block.imgPairAfter) {
    return {
      type: 'pair',
      imgPairAfter: block.imgPairAfter,
    }
  }

  if (block.imgTrioAfter) {
    return {
      type: 'trio',
      imgTrioAfter: block.imgTrioAfter,
    }
  }

  return null
}

function normalizeEditorialComponentKey(component: string): string {
  const normalized = component.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (
    normalized === 'pull_quote'
    || normalized === 'pullquote'
    || normalized === 'quote'
  ) {
    return PULL_QUOTE_COMPONENT
  }
  if (
    normalized === 'key_takeaway'
    || normalized === 'key_takeaways'
    || normalized === 'takeaways'
    || normalized === 'key_takeaway_box'
    || normalized === 'key_takeaways_box'
  ) {
    return KEY_TAKEAWAYS_COMPONENT
  }
  if (
    normalized === 'in_the_know'
    || normalized === 'in_theknow'
    || normalized === 'in_the_know_box'
    || normalized === 'in_theknow_box'
    || normalized === 'in_the_know_callout'
  ) {
    return IN_THE_KNOW_COMPONENT
  }
  return normalized
}

function parseEditorialFrame(
  block: EditorialBlock,
  expectedComponent: string
): {
  label: string
  bodyLines: string[]
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
} {
  const lines = block.markdown
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/, '').trim())

  let hasStartMarker = false
  let hasEndMarker = false
  let hasLabelMarker = false
  let hasBoxMarker = false
  let hasComponentLine = false
  let labelFromMarker = ''
  const bodyLines: string[] = []

  lines.forEach((line) => {
    if (!line) return

    const startMatch = line.match(/^\[!EDITORIAL-BLOCK-START\|([^\]]+)\]$/i)
    if (startMatch) {
      hasStartMarker = normalizeEditorialComponentKey(startMatch[1]) === expectedComponent
      return
    }

    const endMatch = line.match(/^\[!EDITORIAL-BLOCK-END\|([^\]]+)\]$/i)
    if (endMatch) {
      hasEndMarker = normalizeEditorialComponentKey(endMatch[1]) === expectedComponent
      return
    }

    const labelMatch = line.match(/^\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]$/i)
    if (labelMatch) {
      hasLabelMarker = true
      labelFromMarker = labelMatch[1].trim()
      return
    }

    const boxMatch = line.match(/^\[!EDITORIAL-BOX\|([^\]]+)\]$/i)
    if (boxMatch) {
      hasBoxMarker = normalizeEditorialComponentKey(boxMatch[1]) === expectedComponent
      return
    }

    if (/^\*\*Component:\*\*/i.test(line)) {
      hasComponentLine = true
      return
    }

    bodyLines.push(line)
  })

  return {
    label: labelFromMarker || block.label,
    bodyLines,
    hasStartMarker,
    hasEndMarker,
    hasLabelMarker,
    hasBoxMarker,
    hasComponentLine,
  }
}

function buildCanonicalKeyTakeawaysMarkdown(
  label: string,
  rawItems: string[],
  options?: {
    useFallbackItems?: boolean
  }
): string {
  const normalizedLabel = label.trim() || KEY_TAKEAWAYS_LABEL
  const useFallbackItems = options?.useFallbackItems ?? true
  const normalizedItems = rawItems
    .map((item) =>
      item
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
    )
  const nonEmptyItems = normalizedItems.filter((item) => item.length > 0)

  const items = useFallbackItems
    ? nonEmptyItems.length > 0
      ? nonEmptyItems.slice(0, EDITORIAL_MAX_TAKEAWAYS)
      : ['Add takeaway 1', 'Add takeaway 2', 'Add takeaway 3']
    : normalizedItems.length > 0
      ? normalizedItems.slice(0, EDITORIAL_MAX_TAKEAWAYS)
      : ['']

  return [
    `> [!EDITORIAL-BLOCK-START|${KEY_TAKEAWAYS_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${KEY_TAKEAWAYS_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    ...items.map((item) => `> - ${item}`),
    `> [!EDITORIAL-BLOCK-END|${KEY_TAKEAWAYS_COMPONENT}]`,
  ].join('\n')
}

function buildCanonicalPullQuoteMarkdown(
  label: string,
  rawQuote: string,
  options?: {
    useFallbackQuote?: boolean
  }
): string {
  const normalizedLabel = label.trim() || PULL_QUOTE_LABEL
  const useFallbackQuote = options?.useFallbackQuote ?? true
  const quote = rawQuote.trim()
  const normalizedQuote = quote || (useFallbackQuote ? 'Add pull quote before publishing.' : '')

  return [
    `> [!EDITORIAL-BLOCK-START|${PULL_QUOTE_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${PULL_QUOTE_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    `> "${normalizedQuote}"`,
    `> [!EDITORIAL-BLOCK-END|${PULL_QUOTE_COMPONENT}]`,
  ].join('\n')
}

function buildCanonicalInTheKnowMarkdown(
  label: string,
  rawText: string,
  options?: {
    useFallbackText?: boolean
  }
): string {
  const normalizedLabel = label.trim() || IN_THE_KNOW_LABEL
  const useFallbackText = options?.useFallbackText ?? true
  const text = rawText.trim()
  const normalizedText = text || (useFallbackText ? 'Add context details before publishing.' : '')

  return [
    `> [!EDITORIAL-BLOCK-START|${IN_THE_KNOW_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${IN_THE_KNOW_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    ...normalizedText.split('\n').map((line) => `> ${line}`),
    `> [!EDITORIAL-BLOCK-END|${IN_THE_KNOW_COMPONENT}]`,
  ].join('\n')
}

function buildDefaultEditorialTemplate(
  component: SupportedEditorialComponent
): {
  label: string
  markdown: string
} {
  if (component === PULL_QUOTE_COMPONENT) {
    return {
      label: PULL_QUOTE_LABEL,
      markdown: buildCanonicalPullQuoteMarkdown(PULL_QUOTE_LABEL, ''),
    }
  }

  if (component === IN_THE_KNOW_COMPONENT) {
    return {
      label: IN_THE_KNOW_LABEL,
      markdown: buildCanonicalInTheKnowMarkdown(IN_THE_KNOW_LABEL, ''),
    }
  }

  return {
    label: KEY_TAKEAWAYS_LABEL,
    markdown: buildCanonicalKeyTakeawaysMarkdown(KEY_TAKEAWAYS_LABEL, []),
  }
}

function parseKeyTakeawayEditorialBlock(block: EditorialBlock): {
  label: string
  rawItems: string[]
  items: string[]
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
} {
  const frame = parseEditorialFrame(block, KEY_TAKEAWAYS_COMPONENT)

  const listItemRegex = /^([-*+]\s+|\d+\.\s+)/
  const rawItems = frame.bodyLines
    .filter((line) => listItemRegex.test(line))
    .map((line) =>
      line
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
    )
  const items = rawItems.filter((item) => item.length > 0)

  const label = frame.label || KEY_TAKEAWAYS_LABEL
  const correctedMarkdown = buildCanonicalKeyTakeawaysMarkdown(label, items)

  return {
    label,
    rawItems,
    items,
    hasStartMarker: frame.hasStartMarker,
    hasEndMarker: frame.hasEndMarker,
    hasLabelMarker: frame.hasLabelMarker,
    hasBoxMarker: frame.hasBoxMarker,
    hasComponentLine: frame.hasComponentLine,
    correctedMarkdown,
  }
}

function parsePullQuoteEditorialBlock(block: EditorialBlock): {
  label: string
  quoteText: string
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
} {
  const frame = parseEditorialFrame(block, PULL_QUOTE_COMPONENT)
  const quoteCandidates = frame.bodyLines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(placement|why)\s*:/i.test(line)
        && !/^\*\*(placement|why):\*\*/i.test(line)
    )

  const quotedCandidate = quoteCandidates.find((line) => /^["“].+["”]$/.test(line))
  const selectedQuote = (quotedCandidate || quoteCandidates.join(' ')).trim()
  const quoteText = selectedQuote
    .replace(/^["'“”\s]+/, '')
    .replace(/["'“”\s]+$/, '')
    .trim()

  const label = frame.label || PULL_QUOTE_LABEL
  const correctedMarkdown = buildCanonicalPullQuoteMarkdown(label, quoteText)

  return {
    label,
    quoteText,
    hasStartMarker: frame.hasStartMarker,
    hasEndMarker: frame.hasEndMarker,
    hasLabelMarker: frame.hasLabelMarker,
    hasBoxMarker: frame.hasBoxMarker,
    hasComponentLine: frame.hasComponentLine,
    correctedMarkdown,
  }
}

function parseInTheKnowEditorialBlock(block: EditorialBlock): {
  label: string
  text: string
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
} {
  const frame = parseEditorialFrame(block, IN_THE_KNOW_COMPONENT)
  const text = frame.bodyLines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  const label = frame.label || IN_THE_KNOW_LABEL
  const correctedMarkdown = buildCanonicalInTheKnowMarkdown(label, text)

  return {
    label,
    text,
    hasStartMarker: frame.hasStartMarker,
    hasEndMarker: frame.hasEndMarker,
    hasLabelMarker: frame.hasLabelMarker,
    hasBoxMarker: frame.hasBoxMarker,
    hasComponentLine: frame.hasComponentLine,
    correctedMarkdown,
  }
}

function validateEditorialBlockForPublish(block: EditorialBlock): EditorialPublishValidation {
  const component = normalizeEditorialComponentKey(block.component)

  if (component === KEY_TAKEAWAYS_COMPONENT) {
    const parsed = parseKeyTakeawayEditorialBlock(block)
    const missingParts: string[] = []

    if (!parsed.hasStartMarker) missingParts.push('start marker')
    if (!parsed.hasLabelMarker) missingParts.push('label marker')
    if (!parsed.hasBoxMarker) missingParts.push('box marker')
    if (!parsed.hasComponentLine) missingParts.push('component line')
    if (!parsed.hasEndMarker) missingParts.push('end marker')
    if (parsed.items.length === 0) missingParts.push('takeaway bullets')

    if (missingParts.length > 0) {
      return {
        status: 'invalid',
        message: `Block markdown incorrect (${missingParts.join(', ')})`,
        correctedMarkdown: parsed.correctedMarkdown,
      }
    }

    return {
      status: 'supported',
      payloadBlock: {
        blockType: 'key-takeaway',
        label: parsed.label,
        items: parsed.items.slice(0, 5).map((text) => ({ text })),
      },
      correctedMarkdown: parsed.correctedMarkdown,
      mappedPayloadBlockType: 'key-takeaway',
    }
  }

  if (component === PULL_QUOTE_COMPONENT) {
    const parsed = parsePullQuoteEditorialBlock(block)
    const missingParts: string[] = []

    if (!parsed.hasStartMarker) missingParts.push('start marker')
    if (!parsed.hasLabelMarker) missingParts.push('label marker')
    if (!parsed.hasBoxMarker) missingParts.push('box marker')
    if (!parsed.hasComponentLine) missingParts.push('component line')
    if (!parsed.hasEndMarker) missingParts.push('end marker')
    if (!parsed.quoteText) missingParts.push('quote text')

    if (missingParts.length > 0) {
      return {
        status: 'invalid',
        message: `Block markdown incorrect (${missingParts.join(', ')})`,
        correctedMarkdown: parsed.correctedMarkdown,
      }
    }

    return {
      status: 'supported',
      payloadBlock: {
        blockType: 'pull-quote',
        quote: parsed.quoteText,
      },
      correctedMarkdown: parsed.correctedMarkdown,
      mappedPayloadBlockType: 'pull-quote',
    }
  }

  if (component === IN_THE_KNOW_COMPONENT) {
    const parsed = parseInTheKnowEditorialBlock(block)
    const missingParts: string[] = []

    if (!parsed.hasStartMarker) missingParts.push('start marker')
    if (!parsed.hasLabelMarker) missingParts.push('label marker')
    if (!parsed.hasBoxMarker) missingParts.push('box marker')
    if (!parsed.hasComponentLine) missingParts.push('component line')
    if (!parsed.hasEndMarker) missingParts.push('end marker')
    if (!parsed.text) missingParts.push('text')

    if (missingParts.length > 0) {
      return {
        status: 'invalid',
        message: `Block markdown incorrect (${missingParts.join(', ')})`,
        correctedMarkdown: parsed.correctedMarkdown,
      }
    }

    return {
      status: 'supported',
      payloadBlock: {
        blockType: 'in-the-know',
        label: parsed.label,
        text: parsed.text,
      },
      correctedMarkdown: parsed.correctedMarkdown,
      mappedPayloadBlockType: 'in-the-know',
    }
  }

  return {
    status: 'unsupported',
    message: `Unsupported editorial block component: ${block.component}`,
  }
}

function buildEditorialPublishAnalysis(editorialBlocks: EditorialBlock[]): EditorialPublishAnalysis {
  const byId: Record<string, EditorialPublishValidation> = {}
  const blockingBlocks: Array<{ blockId: string; message: string }> = []

  editorialBlocks.forEach((block) => {
    const validation = validateEditorialBlockForPublish(block)
    byId[block.id] = validation

    if (validation.status !== 'supported') {
      blockingBlocks.push({
        blockId: block.id,
        message: `${block.label}: ${validation.message}`,
      })
    }
  })

  return {
    byId,
    blockingBlocks,
    hasBlockingBlocks: blockingBlocks.length > 0,
  }
}

// Parse markdown into blocks at each header
function stripLeadingH1WithOffset(markdown: string): {
  markdown: string
  removedLineCount: number
} {
  if (!markdown) {
    return {
      markdown: '',
      removedLineCount: 0,
    }
  }

  const lines = markdown.split('\n')
  if (!/^#\s+/.test(lines[0].trimStart())) {
    return {
      markdown: markdown.trim(),
      removedLineCount: 0,
    }
  }

  let contentStart = 1
  while (contentStart < lines.length && lines[contentStart].trim() === '') {
    contentStart++
  }

  return {
    markdown: lines.slice(contentStart).join('\n').trim(),
    removedLineCount: contentStart,
  }
}

function getMarkdownHeaderLevel(line: string): number | null {
  const match = line.trimStart().match(/^(#{1,6})\s+/)
  if (!match) return null
  return match[1].length
}

function resolveSplitLevel(lines: string[]): number | null {
  const headerLevels = lines
    .map(getMarkdownHeaderLevel)
    .filter((level): level is number => level !== null)
  return headerLevels.includes(2)
    ? 2
    : headerLevels.includes(1)
      ? 1
      : headerLevels.length
        ? Math.min(...headerLevels)
        : null
}

function parseMarkdownToBlocksDetailed(markdown: string): {
  blocks: ContentBlock[]
  ranges: Array<{ id: string; startLine: number; endLine: number }>
} {
  // Title is managed separately in the staging UI; keep blocks body-only.
  const { markdown: strippedMarkdown, removedLineCount } =
    stripLeadingH1WithOffset(markdown)
  const lines = strippedMarkdown.split('\n')
  const splitLevel = resolveSplitLevel(lines)

  const blocks: ContentBlock[] = []
  const ranges: Array<{ id: string; startLine: number; endLine: number }> = []
  let currentBlock: string[] = []
  let blockIndex = 0
  let currentStartLine = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headerLevel = getMarkdownHeaderLevel(line)
    const isSplitHeader = splitLevel !== null && headerLevel === splitLevel

    if (isSplitHeader && currentBlock.length > 0) {
      // Save previous block
      const id = `block_${blockIndex++}`
      const content = currentBlock.join('\n').trim()
      blocks.push({
        id,
        type: 'text',
        content,
      })
      ranges.push({
        id,
        startLine: currentStartLine + removedLineCount,
        endLine: i - 1 + removedLineCount,
      })
      currentBlock = [line]
      currentStartLine = i
    } else {
      if (currentBlock.length === 0) {
        currentStartLine = i
      }
      currentBlock.push(line)
    }
  }

  // Don't forget the last block
  if (currentBlock.length > 0) {
    const content = currentBlock.join('\n').trim()
    if (content) {
      const id = `block_${blockIndex}`
      blocks.push({
        id,
        type: 'text',
        content,
      })
      ranges.push({
        id,
        startLine: currentStartLine + removedLineCount,
        endLine: lines.length - 1 + removedLineCount,
      })
    }
  }

  return { blocks, ranges }
}

function hasMeaningfulEditorialPlacement(
  editorialBlocks: EditorialBlock[],
  contentBlocks: ContentBlock[]
): boolean {
  if (!editorialBlocks.length || !contentBlocks.length) {
    return false
  }

  const blockIds = new Set(contentBlocks.map((block) => block.id))

  return editorialBlocks.some((block) => {
    const hasValidAfterBlock = Boolean(
      block.afterBlockId && blockIds.has(block.afterBlockId)
    )
    const hasUsefulAnchor = typeof block.anchorLine === 'number' && block.anchorLine > 0
    return hasValidAfterBlock || hasUsefulAnchor
  })
}

async function fetchEditorialBlocksFromRun(
  runId: string,
  fetchResultFn: (runId: string) => Promise<{ markdown: string }>
): Promise<EditorialBlock[]> {
  if (!runId) return []

  try {
    const result = await fetchResultFn(runId)
    const extracted = extractEditorialBlocks(result.markdown || '')
    return extracted.editorialBlocks
  } catch {
    return []
  }
}

function parseMarkdownToBlocks(markdown: string): ContentBlock[] {
  return parseMarkdownToBlocksDetailed(markdown).blocks
}

function attachEditorialBlocksToContentBlocks(
  blocks: ContentBlock[],
  ranges: Array<{ id: string; startLine: number; endLine: number }>,
  editorialBlocks: EditorialBlock[]
): EditorialBlock[] {
  if (!editorialBlocks.length) return []

  const anchorBlocks = blocks.filter(isTextualBlock)

  if (!anchorBlocks.length || !ranges.length) {
    return normalizeEditorialBlocks(editorialBlocks).map((block) => ({
      ...block,
      afterBlockId: null,
    }))
  }

  return normalizeEditorialBlocks(editorialBlocks).map((block) => {
    if (
      block.afterBlockId
      && blocks.some((contentBlock) => contentBlock.id === block.afterBlockId)
    ) {
      return block
    }

    const anchorLine = typeof block.anchorLine === 'number' ? block.anchorLine : 0
    let afterIndex = -1

    for (let i = 0; i < ranges.length; i++) {
      const currentRange = ranges[i]
      if (anchorLine <= currentRange.startLine) {
        afterIndex = i - 1
        break
      }

      if (i === ranges.length - 1) {
        afterIndex = i
        break
      }
    }

    if (afterIndex >= anchorBlocks.length) {
      afterIndex = anchorBlocks.length - 1
    }

    return {
      ...block,
      afterBlockId: afterIndex >= 0 ? anchorBlocks[afterIndex].id : null,
    }
  })
}

function composeArticleMarkdown(
  blocks: ContentBlock[],
  editorialBlocks: EditorialBlock[]
): string {
  const normalizedEditorialBlocks = normalizeEditorialBlocks(editorialBlocks)
  const blockIds = new Set(blocks.map((block) => block.id))
  const unanchoredEditorial = normalizedEditorialBlocks.filter(
    (block) => !block.afterBlockId || !blockIds.has(block.afterBlockId)
  )
  const anchoredEditorialByBlock = new Map<string, EditorialBlock[]>()

  normalizedEditorialBlocks.forEach((block) => {
    if (!block.afterBlockId || !blockIds.has(block.afterBlockId)) return
    const list = anchoredEditorialByBlock.get(block.afterBlockId) || []
    list.push(block)
    anchoredEditorialByBlock.set(block.afterBlockId, list)
  })

  const parts: string[] = []

  unanchoredEditorial.forEach((block) => {
    if (block.markdown.trim()) {
      parts.push(block.markdown.trim())
    }
  })

  blocks.forEach((block) => {
    const content = block.content.trim()
    if (content) {
      parts.push(content)
    }

    const anchored = anchoredEditorialByBlock.get(block.id) || []
    anchored.forEach((editorialBlock) => {
      if (editorialBlock.markdown.trim()) {
        parts.push(editorialBlock.markdown.trim())
      }
    })
  })

  return parts.join('\n\n').trim()
}

function buildTimelineItems(
  blocks: ContentBlock[],
  editorialBlocks: EditorialBlock[]
): TimelineItem[] {
  const normalizedEditorialBlocks = normalizeEditorialBlocks(editorialBlocks)
  const blockIds = new Set(blocks.map((block) => block.id))
  const editorialBeforeFirst = normalizedEditorialBlocks.filter(
    (block) => !block.afterBlockId || !blockIds.has(block.afterBlockId)
  )
  const editorialByBlockId = new Map<string, EditorialBlock[]>()

  normalizedEditorialBlocks.forEach((block) => {
    if (!block.afterBlockId || !blockIds.has(block.afterBlockId)) return
    const list = editorialByBlockId.get(block.afterBlockId) || []
    list.push(block)
    editorialByBlockId.set(block.afterBlockId, list)
  })

  const items: TimelineItem[] = []

  editorialBeforeFirst.forEach((block) => {
    items.push({
      id: getEditorialTimelineItemId(block.id),
      type: 'editorial',
      editorialBlockId: block.id,
    })
  })

  blocks.forEach((block) => {
    const anchoredEditorialBlocks = editorialByBlockId.get(block.id) || []

    if (isStandaloneMediaBlock(block)) {
      items.push({
        id: getImageTimelineItemId(block.id),
        type: 'image',
        contentBlockId: block.id,
      })
    } else {
      items.push({
        id: getContentTimelineItemId(block.id),
        type: 'content',
        contentBlockId: block.id,
      })
    }

    anchoredEditorialBlocks.forEach((editorialBlock) => {
      items.push({
        id: getEditorialTimelineItemId(editorialBlock.id),
        type: 'editorial',
        editorialBlockId: editorialBlock.id,
      })
    })
  })

  return items
}

function applyTimelineItemsToDraft(
  timelineItems: TimelineItem[],
  blocks: ContentBlock[],
  editorialBlocks: EditorialBlock[]
): {
  blocks: ContentBlock[]
  editorialBlocks: EditorialBlock[]
} {
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const normalizedEditorialBlocks = normalizeEditorialBlocks(editorialBlocks)
  const editorialById = new Map(
    normalizedEditorialBlocks.map((editorialBlock) => [editorialBlock.id, editorialBlock])
  )

  const nextBlocks: ContentBlock[] = []
  const nextEditorialBlocks: EditorialBlock[] = []
  const seenBlockIds = new Set<string>()
  const seenEditorialIds = new Set<string>()
  let lastBlockId: string | null = null
  let lastItemWasImage = false

  timelineItems.forEach((item) => {
    if (item.type === 'content' || item.type === 'image') {
      const block = blockById.get(item.contentBlockId)
      if (!block || seenBlockIds.has(block.id)) return
      nextBlocks.push(block)
      seenBlockIds.add(block.id)
      lastBlockId = block.id
      lastItemWasImage = item.type === 'image'
      return
    }

    const editorialBlock = editorialById.get(item.editorialBlockId)
    if (!editorialBlock || seenEditorialIds.has(editorialBlock.id)) return
    nextEditorialBlocks.push({
      ...editorialBlock,
      afterBlockId: lastBlockId,
      placeAfterImage: lastItemWasImage,
    })
    seenEditorialIds.add(editorialBlock.id)
  })

  // Keep any missing blocks/items as a fallback so data is never dropped.
  blocks.forEach((block) => {
    if (seenBlockIds.has(block.id)) return
    nextBlocks.push(block)
    seenBlockIds.add(block.id)
    lastBlockId = block.id
    lastItemWasImage = isStandaloneMediaBlock(block)
  })

  normalizedEditorialBlocks.forEach((editorialBlock) => {
    if (seenEditorialIds.has(editorialBlock.id)) return
    nextEditorialBlocks.push({
      ...editorialBlock,
      afterBlockId: lastBlockId,
      placeAfterImage: lastItemWasImage,
    })
    seenEditorialIds.add(editorialBlock.id)
  })

  return {
    blocks: nextBlocks,
    editorialBlocks: nextEditorialBlocks,
  }
}

function getEditorialBlockBody(markdown: string): string {
  const lines = markdown.split('\n')
  const cleaned = lines
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      if (/^\[!EDITORIAL-BLOCK-START\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BLOCK-END\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BLOCK-LABEL\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BOX\|/i.test(trimmed)) return false
      if (/^\*\*component:\*\*/i.test(trimmed)) return false
      if (/^\*\*(placement|why):\*\*/i.test(trimmed)) return false
      if (/^(placement|why)\s*:/i.test(trimmed)) return false
      return true
    })
    .join('\n')

  return cleaned.trim()
}

function resizeTextareaToContent(element: HTMLTextAreaElement): void {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

function renderEditorialBlockCard(
  block: EditorialBlock,
  displayNumber: number,
  options?: {
    validation?: EditorialPublishValidation
    onFixBlock?: () => void
    disableFix?: boolean
    canEdit?: boolean
    onToggleEdit?: () => void
    disableEditToggle?: boolean
    onChangeMarkdown?: (nextMarkdown: string) => void
    onRemoveBlock?: () => void
    disableRemove?: boolean
    canReorder?: boolean
    onMoveUp?: () => void
    onMoveDown?: () => void
    disableMoveUp?: boolean
    disableMoveDown?: boolean
  }
) {
  const previewMarkdown = getEditorialBlockBody(block.markdown)
  const validation = options?.validation
  const normalizedComponent = normalizeEditorialComponentKey(block.component)
  const keyTakeawaysParsed = normalizedComponent === KEY_TAKEAWAYS_COMPONENT
    ? parseKeyTakeawayEditorialBlock(block)
    : null
  const pullQuoteParsed = normalizedComponent === PULL_QUOTE_COMPONENT
    ? parsePullQuoteEditorialBlock(block)
    : null
  const inTheKnowParsed = normalizedComponent === IN_THE_KNOW_COMPONENT
    ? parseInTheKnowEditorialBlock(block)
    : null
  const isKeyTakeaways = normalizedComponent === KEY_TAKEAWAYS_COMPONENT
  const isPullQuote = normalizedComponent === PULL_QUOTE_COMPONENT
  const isInTheKnow = normalizedComponent === IN_THE_KNOW_COMPONENT
  const supportsStructuredEditor = isKeyTakeaways || isPullQuote || isInTheKnow
  const isEditMode = Boolean(options?.canEdit && options?.onChangeMarkdown)
  const keyTakeawaysLabel = keyTakeawaysParsed?.label || block.label || KEY_TAKEAWAYS_LABEL
  const keyTakeawaysDraftItems = keyTakeawaysParsed?.rawItems.length
    ? keyTakeawaysParsed.rawItems
    : ['']
  const pullQuoteLabel = pullQuoteParsed?.label || block.label || PULL_QUOTE_LABEL
  const pullQuoteText = pullQuoteParsed?.quoteText || ''
  const inTheKnowLabel = inTheKnowParsed?.label || block.label || IN_THE_KNOW_LABEL
  const inTheKnowText = inTheKnowParsed?.text || ''
  return (
    <article key={block.id} className={`block-card editorial-card ${isEditMode ? 'editing' : ''}`}>
      <div className="block-card-header">
        <div className="block-card-header-left">
          {options?.canReorder && (
            <div className="block-drag-handle" title="Drag to reorder">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="5" r="1.5"/>
                <circle cx="15" cy="5" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/>
                <circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="19" r="1.5"/>
                <circle cx="15" cy="19" r="1.5"/>
              </svg>
            </div>
          )}
          {displayNumber > 0 && (
            <span className="block-number" title="Block order">
              {displayNumber}
            </span>
          )}
          <span className="block-type-badge block-type-badge-editorial">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5V4a2 2 0 0 1 2-2h9l5 5v12.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5z"/>
              <path d="M14 2v6h6"/>
            </svg>
            Editorial
          </span>
          <strong className="editorial-card-label">{block.label}</strong>
          {isEditMode && (
            <span className="editorial-card-component">{block.component}</span>
          )}
        </div>
        <div className="block-card-header-right">
          {options?.canReorder && (
            <div className="block-move-buttons">
              <button
                type="button"
                className="block-move-btn"
                onClick={options.onMoveUp}
                disabled={options.disableMoveUp}
                title="Move up"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              </button>
              <button
                type="button"
                className="block-move-btn"
                onClick={options.onMoveDown}
                disabled={options.disableMoveDown}
                title="Move down"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            </div>
          )}
          {options?.onToggleEdit && (
            <button
              type="button"
              className="block-edit-btn"
              onClick={options.onToggleEdit}
              disabled={options.disableEditToggle}
              title={isEditMode ? 'Done editing block' : 'Edit block'}
            >
              {isEditMode ? 'Done' : 'Edit'}
            </button>
          )}
          {options?.onRemoveBlock && (
            <button
              type="button"
              className="block-delete-btn"
              onClick={options.onRemoveBlock}
              disabled={options.disableRemove}
              title="Remove editorial block"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="editorial-card-body">

      {isEditMode && validation?.status === 'supported' && (
        <div
          style={{
            marginBottom: '0.6rem',
            padding: '0.45rem 0.6rem',
            borderRadius: '8px',
            background: 'rgba(52, 119, 83, 0.12)',
            color: '#2e6f4f',
            fontSize: '0.82rem',
          }}
        >
          Mapped to Payload as <code>{validation.mappedPayloadBlockType}</code>.
        </div>
      )}

      {isEditMode && validation?.status === 'unsupported' && (
        <div
          style={{
            marginBottom: '0.6rem',
            padding: '0.45rem 0.6rem',
            borderRadius: '8px',
            background: 'rgba(188, 120, 0, 0.12)',
            color: '#7f4f00',
            fontSize: '0.82rem',
          }}
        >
          {validation.message}
        </div>
      )}

      {isEditMode && validation?.status === 'invalid' && (
        <div
          style={{
            marginBottom: '0.6rem',
            padding: '0.55rem 0.6rem',
            borderRadius: '8px',
            background: 'rgba(175, 52, 52, 0.12)',
            color: '#852f2f',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ marginBottom: '0.45rem' }}>
            {validation.message}
          </div>
          {options?.onFixBlock && (
            <button
              type="button"
              onClick={options.onFixBlock}
              disabled={options.disableFix}
              style={{
                border: '1px solid rgba(133, 47, 47, 0.4)',
                background: '#fff',
                color: '#852f2f',
                borderRadius: '999px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.78rem',
                cursor: options.disableFix ? 'not-allowed' : 'pointer',
                opacity: options.disableFix ? 0.6 : 1,
              }}
            >
              Fix block
            </button>
          )}
        </div>
      )}

      {isEditMode && supportsStructuredEditor ? (
        <div className="editorial-structured-editor">
          {isKeyTakeaways && (
            <>
              <div className="editorial-field-group">
                <label className="editorial-field-label">Label</label>
                <input
                  type="text"
                  className="editorial-field-input"
                  value={keyTakeawaysLabel}
                  onChange={(event) => options.onChangeMarkdown?.(
                    buildCanonicalKeyTakeawaysMarkdown(
                      event.target.value,
                      keyTakeawaysDraftItems,
                      { useFallbackItems: false }
                    )
                  )}
                  placeholder={KEY_TAKEAWAYS_LABEL}
                />
              </div>

              <div className="editorial-field-group">
                <div className="editorial-field-row">
                  <label className="editorial-field-label">Takeaways</label>
                  <span className="editorial-field-meta">
                    {keyTakeawaysDraftItems.filter((item) => item.trim().length > 0).length}
                    {' / '}
                    {EDITORIAL_MAX_TAKEAWAYS}
                  </span>
                </div>
                <div className="editorial-takeaway-list">
                  {keyTakeawaysDraftItems.map((item, itemIndex) => (
                    <div key={`${block.id}_takeaway_${itemIndex}`} className="editorial-takeaway-row">
                      <span className="editorial-takeaway-index">{itemIndex + 1}</span>
                      <input
                        type="text"
                        className="editorial-field-input"
                        value={item}
                        onChange={(event) => {
                          const nextItems = [...keyTakeawaysDraftItems]
                          nextItems[itemIndex] = event.target.value
                          options.onChangeMarkdown?.(
                            buildCanonicalKeyTakeawaysMarkdown(
                              keyTakeawaysLabel,
                              nextItems,
                              { useFallbackItems: false }
                            )
                          )
                        }}
                        placeholder={`Takeaway ${itemIndex + 1}`}
                      />
                      <button
                        type="button"
                        className="editorial-inline-btn danger"
                        onClick={() => {
                          const nextItems = keyTakeawaysDraftItems.filter((_, index) => index !== itemIndex)
                          options.onChangeMarkdown?.(
                            buildCanonicalKeyTakeawaysMarkdown(
                              keyTakeawaysLabel,
                              nextItems.length ? nextItems : [''],
                              { useFallbackItems: false }
                            )
                          )
                        }}
                        disabled={keyTakeawaysDraftItems.length <= 1}
                        title="Remove takeaway"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="editorial-field-actions">
                  <button
                    type="button"
                    className="editorial-inline-btn"
                    onClick={() => options.onChangeMarkdown?.(
                      buildCanonicalKeyTakeawaysMarkdown(
                        keyTakeawaysLabel,
                        [...keyTakeawaysDraftItems, ''],
                        { useFallbackItems: false }
                      )
                    )}
                    disabled={keyTakeawaysDraftItems.length >= EDITORIAL_MAX_TAKEAWAYS}
                  >
                    Add takeaway
                  </button>
                </div>
              </div>
            </>
          )}

          {isPullQuote && (
            <>
              <div className="editorial-field-group">
                <label className="editorial-field-label">Label</label>
                <input
                  type="text"
                  className="editorial-field-input"
                  value={pullQuoteLabel}
                  onChange={(event) => options.onChangeMarkdown?.(
                    buildCanonicalPullQuoteMarkdown(
                      event.target.value,
                      pullQuoteText,
                      { useFallbackQuote: false }
                    )
                  )}
                  placeholder={PULL_QUOTE_LABEL}
                />
              </div>

              <div className="editorial-field-group">
                <label className="editorial-field-label">Quote</label>
                <textarea
                  className="editorial-field-textarea"
                  value={pullQuoteText}
                  onChange={(event) => options.onChangeMarkdown?.(
                    buildCanonicalPullQuoteMarkdown(
                      pullQuoteLabel,
                      event.target.value,
                      { useFallbackQuote: false }
                    )
                  )}
                  rows={3}
                  placeholder="Add the pull quote text"
                />
              </div>
            </>
          )}

          {isInTheKnow && (
            <>
              <div className="editorial-field-group">
                <label className="editorial-field-label">Label</label>
                <input
                  type="text"
                  className="editorial-field-input"
                  value={inTheKnowLabel}
                  onChange={(event) => options.onChangeMarkdown?.(
                    buildCanonicalInTheKnowMarkdown(
                      event.target.value,
                      inTheKnowText,
                      { useFallbackText: false }
                    )
                  )}
                  placeholder={IN_THE_KNOW_LABEL}
                />
              </div>

              <div className="editorial-field-group">
                <label className="editorial-field-label">Body Text</label>
                <textarea
                  className="editorial-field-textarea"
                  value={inTheKnowText}
                  onChange={(event) => options.onChangeMarkdown?.(
                    buildCanonicalInTheKnowMarkdown(
                      inTheKnowLabel,
                      event.target.value,
                      { useFallbackText: false }
                    )
                  )}
                  rows={4}
                  placeholder="Add supporting context for this callout"
                />
              </div>
            </>
          )}

          <p className="editorial-editor-hint">
            Schema editor keeps block markers and component wiring in the required format.
          </p>
        </div>
      ) : isEditMode ? (
        <div style={{ marginTop: '0.35rem' }}>
          <textarea
            value={block.markdown}
            onChange={(event) => options.onChangeMarkdown?.(event.target.value)}
            onInput={(event) => resizeTextareaToContent(event.currentTarget)}
            ref={(element) => {
              if (element) resizeTextareaToContent(element)
            }}
            rows={Math.max(8, block.markdown.split('\n').length + 1)}
            className="block-textarea"
            style={{ width: '100%' }}
          />
          <p style={{ marginTop: '0.35rem', fontSize: '0.76rem', opacity: 0.72 }}>
            Unsupported block type. Edit markdown directly.
          </p>
        </div>
      ) : keyTakeawaysParsed && keyTakeawaysParsed.items.length > 0 ? (
        <section className="editorial-preview-card editorial-preview-key-takeaways">
          <h4>{keyTakeawaysParsed.label || KEY_TAKEAWAYS_LABEL}</h4>
          <ul>
            {keyTakeawaysParsed.items.map((item, itemIndex) => (
              <li key={`${block.id}_takeaway_${itemIndex}`}>{item}</li>
            ))}
          </ul>
        </section>
      ) : pullQuoteParsed && pullQuoteParsed.quoteText ? (
        <figure className="editorial-preview-card editorial-preview-pull-quote">
          <blockquote>
            <p>{`"${pullQuoteParsed.quoteText}"`}</p>
          </blockquote>
        </figure>
      ) : inTheKnowParsed && inTheKnowParsed.text ? (
        <section className="editorial-preview-card editorial-preview-in-the-know">
          <h4>{inTheKnowParsed.label || IN_THE_KNOW_LABEL}</h4>
          <p>{inTheKnowParsed.text}</p>
        </section>
      ) : previewMarkdown ? (
        <div className="block-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {previewMarkdown}
          </ReactMarkdown>
        </div>
      ) : (
        <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: 0 }}>
          No preview content available.
        </p>
      )}

      {isEditMode && (
        <details className="editorial-markdown-details">
          <summary>{supportsStructuredEditor ? 'Generated markdown' : 'Raw markdown'}</summary>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              marginTop: '0.5rem',
              fontSize: '0.78rem',
            }}
          >
            {block.markdown}
          </pre>
        </details>
      )}
      </div>
    </article>
  )
}

function normalizeBlocks(
  blocks: ContentBlock[] | undefined,
  fallbackContent: string
): NormalizeBlocksResult {
  if (!blocks || blocks.length === 0) {
    return {
      blocks: parseMarkdownToBlocks(fallbackContent),
      mediaBlockIdByLegacyAnchorId: new Map(),
    }
  }

  const normalizedBlocks: ContentBlock[] = []
  const mediaBlockIdByLegacyAnchorId = new Map<string, string>()
  const usedIds = new Set<string>()

  const createUniqueId = (baseId: string): string => {
    let candidate = baseId
    let suffix = 1
    while (usedIds.has(candidate)) {
      candidate = `${baseId}_${suffix}`
      suffix += 1
    }
    usedIds.add(candidate)
    return candidate
  }

  const appendLegacyMediaBlock = (
    anchorId: string,
    mediaType: 'image' | 'img-pair' | 'img-trio',
    mediaBlock: ContentBlock
  ) => {
    const baseId = `${anchorId}__${mediaType}`
    const mediaBlockId = createUniqueId(baseId)
    const finalizedMediaBlock = { ...mediaBlock, id: mediaBlockId }
    normalizedBlocks.push(finalizedMediaBlock)
    mediaBlockIdByLegacyAnchorId.set(anchorId, mediaBlockId)
  }

  blocks.forEach((block, index) => {
    const sourceId = block.id || `block_${index}`
    const blockId = createUniqueId(sourceId)

    if (block.type === 'image') {
      const imageId = block.imageAfter
      if (typeof imageId === 'number') {
        normalizedBlocks.push(
          createSingleImageBlock(blockId, imageId, block.imageAfterAltText)
        )
      }
      return
    }

    if (block.type === 'img-pair') {
      const pair = block.imgPairAfter
      if (pair) {
        normalizedBlocks.push(
          createImgPairBlock(
            blockId,
            pair.imageOne,
            pair.imageTwo,
            pair.caption
          )
        )
      }
      return
    }

    if (block.type === 'img-trio') {
      const trio = block.imgTrioAfter
      if (trio) {
        normalizedBlocks.push(
          createImgTrioBlock(
            blockId,
            trio.format,
            trio.imageOne,
            trio.imageTwo,
            trio.imageThree,
            trio.caption
          )
        )
      }
      return
    }

    const normalizedTextBlock: ContentBlock = {
      id: blockId,
      type: block.type === 'pullquote' ? 'pullquote' : 'text',
      content: block.content || '',
      imageAfter: undefined,
      imageAfterAltText: undefined,
      imgPairAfter: undefined,
      imgTrioAfter: undefined,
    }
    normalizedBlocks.push(normalizedTextBlock)

    if (typeof block.imageAfter === 'number') {
      appendLegacyMediaBlock(
        blockId,
        'image',
        createSingleImageBlock('', block.imageAfter, block.imageAfterAltText)
      )
      return
    }

    if (block.imgPairAfter) {
      appendLegacyMediaBlock(
        blockId,
        'img-pair',
        createImgPairBlock(
          '',
          block.imgPairAfter.imageOne,
          block.imgPairAfter.imageTwo,
          block.imgPairAfter.caption
        )
      )
      return
    }

    if (block.imgTrioAfter) {
      appendLegacyMediaBlock(
        blockId,
        'img-trio',
        createImgTrioBlock(
          '',
          block.imgTrioAfter.format,
          block.imgTrioAfter.imageOne,
          block.imgTrioAfter.imageTwo,
          block.imgTrioAfter.imageThree,
          block.imgTrioAfter.caption
        )
      )
    }
  })

  return {
    blocks: normalizedBlocks,
    mediaBlockIdByLegacyAnchorId,
  }
}

function migrateEditorialBlocksForStandaloneMedia(
  editorialBlocks: EditorialBlock[],
  mediaBlockIdByLegacyAnchorId: Map<string, string>
): EditorialBlock[] {
  return normalizeEditorialBlocks(editorialBlocks).map((editorialBlock) => {
    const afterBlockId = editorialBlock.afterBlockId || null
    if (
      afterBlockId
      && editorialBlock.placeAfterImage
      && mediaBlockIdByLegacyAnchorId.has(afterBlockId)
    ) {
      return {
        ...editorialBlock,
        afterBlockId: mediaBlockIdByLegacyAnchorId.get(afterBlockId) || afterBlockId,
        placeAfterImage: false,
      }
    }

    if (editorialBlock.placeAfterImage) {
      return {
        ...editorialBlock,
        placeAfterImage: false,
      }
    }

    return editorialBlock
  })
}

function getMediaAssetAltText(img?: MediaAsset | null): string {
  if (!img) return ''
  return img.alt_text?.trim() || img.alt?.trim() || img.altText?.trim() || ''
}

function hasExactDimensions(
  img: MediaAsset | null | undefined,
  width: number,
  height: number
): boolean {
  if (!img) return false
  return img.width === width && img.height === height
}

function hasExactImgBlockDimensions(img?: MediaAsset | null): boolean {
  return hasExactDimensions(img, IMG_BLOCK_MIN_WIDTH, IMG_BLOCK_MIN_HEIGHT)
}

function hasExactContentBlockDimensions(img?: MediaAsset | null): boolean {
  return hasExactDimensions(img, CONTENT_BLOCK_WIDTH, CONTENT_BLOCK_HEIGHT)
}

function hasExactFeaturedImageDimensions(img?: MediaAsset | null): boolean {
  return hasExactDimensions(img, FEATURED_IMAGE_WIDTH, FEATURED_IMAGE_HEIGHT)
}

function getImgTrioDimensions(format: ImgTrioFormat): { width: number; height: number } {
  return IMG_TRIO_DIMENSIONS[format]
}

function hasExactImgTrioDimensions(
  img: MediaAsset | null | undefined,
  format: ImgTrioFormat
): boolean {
  const dims = getImgTrioDimensions(format)
  return hasExactDimensions(img, dims.width, dims.height)
}

function getRelationshipId(
  value: MediaAsset['mediaSet']
): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && 'id' in value) {
    const id = value.id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

function pickVariantAssetId(
  variantAssetIds: UploadImageResponse['variantAssetIds'],
  preferredVariant: MediaVariant
): number | null {
  if (!variantAssetIds) return null

  const orderedVariants: MediaVariant[] = [
    preferredVariant,
    ...VARIANT_FALLBACK_ORDER.filter(variant => variant !== preferredVariant),
  ]

  for (const variant of orderedVariants) {
    const rawId = variantAssetIds[variant]
    if (!rawId) continue
    const numericId = Number(rawId)
    if (!Number.isNaN(numericId)) {
      return numericId
    }
  }

  return null
}

function mergeMediaAssetLists(
  existingAssets: MediaAsset[],
  nextAssets: MediaAsset[]
): MediaAsset[] {
  if (!nextAssets.length) return existingAssets

  const mergedAssets = new Map<number, MediaAsset>()
  existingAssets.forEach((asset) => mergedAssets.set(asset.id, asset))
  nextAssets.forEach((asset) => mergedAssets.set(asset.id, asset))

  return Array.from(mergedAssets.values())
}

export default function EditorialStageArticlePage({
  storageKey,
  routes,
  api,
}: EditorialStageArticlePageProps) {
  const {
    fetchLocations,
    fetchMediaAssets,
    createArticle,
    convertMarkdownToLexical,
    fetchResult,
    markArticleSynced,
  } = api
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // URL params (for new staging)
  const urlRunId = searchParams.get('runId') || ''
  const urlTitle = searchParams.get('title') || ''
  const urlContent = searchParams.get('content') || ''
  const urlType = searchParams.get('type') || ''
  const stagedId = searchParams.get('stagedId') || ''

  // Reference data
  const [locations, setLocations] = useState<Location[]>([])
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Staged article state
  const [stagedArticle, setStagedArticle] = useState<StagedArticle | null>(null)
  const [activeEditingTimelineItemId, setActiveEditingTimelineItemId] = useState<string | null>(null)

  // Form state
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null)

  // Modal state for featured image
  const [showImageModal, setShowImageModal] = useState(false)
  const [imageSearch, setImageSearch] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [imageAltText, setImageAltText] = useState('')
  const [imagePhotographerCredit, setImagePhotographerCredit] = useState('')

  // Modal state for block images
  const [blockImageModal, setBlockImageModal] = useState<BlockImageModalState | null>(null)
  const [blockImageSearch, setBlockImageSearch] = useState('')
  const [showBlockUploadModal, setShowBlockUploadModal] = useState(false)
  const [blockImageAltText, setBlockImageAltText] = useState('')
  const [blockImagePhotographerCredit, setBlockImagePhotographerCredit] = useState('')
  const [imgBlockAssets, setImgBlockAssets] = useState<MediaAsset[]>([])
  const [isLoadingImgBlockAssets, setIsLoadingImgBlockAssets] = useState(false)
  const [imgBlockAssetsError, setImgBlockAssetsError] = useState<string | null>(null)
  const [selectedImgBlockAssetIds, setSelectedImgBlockAssetIds] = useState<number[]>([])
  const [imgBlockCaption, setImgBlockCaption] = useState('')
  const [imgTrioFormat, setImgTrioFormat] = useState<ImgTrioFormat>(IMG_TRIO_DEFAULT_FORMAT)

  // Drag and drop state
  const [draggedTimelineItemId, setDraggedTimelineItemId] = useState<string | null>(null)
  const [dragOverTimelineItemId, setDragOverTimelineItemId] = useState<string | null>(null)
  const [openEditorialPickerTarget, setOpenEditorialPickerTarget] = useState<string | null>(null)
  const [openImagePickerTarget, setOpenImagePickerTarget] = useState<string | null>(null)

  // Conversion state
  const [isConverting, setIsConverting] = useState(false)

  // Load or create staged article
  useEffect(() => {
    if (!urlRunId && !stagedId) return

    let isCancelled = false

    const loadStagedArticle = async () => {
      try {
        const stored = localStorage.getItem(storageKey)
        const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []

        if (stagedId) {
          // Load existing staged article
          const existingIndex = allStaged.findIndex(s => s.id === stagedId)
          const existing = existingIndex >= 0 ? allStaged[existingIndex] : null
          if (existing) {
            const extractedFromContent = extractEditorialBlocks(existing.content)
            const extractedFromOriginal = extractEditorialBlocks(existing.originalContent || existing.content)
            const contentForParsing = extractedFromContent.bodyMarkdown || existing.content
            const originalContentForReset = extractedFromOriginal.bodyMarkdown || contentForParsing
            const parsedDetails = parseMarkdownToBlocksDetailed(contentForParsing)
            const normalizedBlocksResult =
              existing.blocks?.length
                ? normalizeBlocks(existing.blocks, contentForParsing)
                : {
                    blocks: parsedDetails.blocks,
                    mediaBlockIdByLegacyAnchorId: new Map<string, string>(),
                  }
            const normalizedBlocks = normalizedBlocksResult.blocks
            const existingEditorialBlocks = migrateEditorialBlocksForStandaloneMedia(
              existing.editorialBlocks || [],
              normalizedBlocksResult.mediaBlockIdByLegacyAnchorId
            )
            const hasMeaningfulExistingPlacement = hasMeaningfulEditorialPlacement(
              existingEditorialBlocks,
              normalizedBlocks
            )
            let fallbackEditorialBlocks = extractedFromContent.editorialBlocks

            if (!hasMeaningfulExistingPlacement && existing.runId) {
              const runEditorialBlocks = await fetchEditorialBlocksFromRun(
                existing.runId,
                fetchResult
              )
              if (runEditorialBlocks.length > 0) {
                fallbackEditorialBlocks = runEditorialBlocks
              }
            }

            const normalizedEditorialBlocks = attachEditorialBlocksToContentBlocks(
              normalizedBlocks,
              parsedDetails.ranges,
              hasMeaningfulExistingPlacement
                ? existingEditorialBlocks
                : fallbackEditorialBlocks
            )
            const normalizedExisting = {
              ...existing,
              originalContent: originalContentForReset,
              blocks: normalizedBlocks,
              content: composeArticleMarkdown(normalizedBlocks, normalizedEditorialBlocks),
              editorialBlocks: normalizedEditorialBlocks,
            }

            if (!isCancelled) {
              setStagedArticle(normalizedExisting)
            }

            const blocksChanged = JSON.stringify(existing.blocks) !== JSON.stringify(normalizedBlocks)
            const editorialChanged = JSON.stringify(existing.editorialBlocks || []) !== JSON.stringify(normalizedEditorialBlocks)
            const contentChanged = existing.content !== normalizedExisting.content
            if (blocksChanged || editorialChanged || contentChanged) {
              allStaged[existingIndex] = normalizedExisting
              localStorage.setItem(storageKey, JSON.stringify(allStaged))
            }
          } else if (!isCancelled) {
            setError('Staged article not found')
          }
        } else if (urlRunId) {
          // Check if already staged
          const existingIndex = allStaged.findIndex(s => s.runId === urlRunId)
          const existing = existingIndex >= 0 ? allStaged[existingIndex] : null
          if (existing) {
            const extractedFromContent = extractEditorialBlocks(existing.content)
            const extractedFromOriginal = extractEditorialBlocks(existing.originalContent || existing.content)
            const contentForParsing = extractedFromContent.bodyMarkdown || existing.content
            const originalContentForReset = extractedFromOriginal.bodyMarkdown || contentForParsing
            const parsedDetails = parseMarkdownToBlocksDetailed(contentForParsing)
            const normalizedBlocksResult =
              existing.blocks?.length
                ? normalizeBlocks(existing.blocks, contentForParsing)
                : {
                    blocks: parsedDetails.blocks,
                    mediaBlockIdByLegacyAnchorId: new Map<string, string>(),
                  }
            const normalizedBlocks = normalizedBlocksResult.blocks
            const existingEditorialBlocks = migrateEditorialBlocksForStandaloneMedia(
              existing.editorialBlocks || [],
              normalizedBlocksResult.mediaBlockIdByLegacyAnchorId
            )
            const hasMeaningfulExistingPlacement = hasMeaningfulEditorialPlacement(
              existingEditorialBlocks,
              normalizedBlocks
            )
            let fallbackEditorialBlocks = extractedFromContent.editorialBlocks

            if (!hasMeaningfulExistingPlacement && existing.runId) {
              const runEditorialBlocks = await fetchEditorialBlocksFromRun(
                existing.runId,
                fetchResult
              )
              if (runEditorialBlocks.length > 0) {
                fallbackEditorialBlocks = runEditorialBlocks
              }
            }

            const normalizedEditorialBlocks = attachEditorialBlocksToContentBlocks(
              normalizedBlocks,
              parsedDetails.ranges,
              hasMeaningfulExistingPlacement
                ? existingEditorialBlocks
                : fallbackEditorialBlocks
            )
            const normalizedExisting = {
              ...existing,
              originalContent: originalContentForReset,
              blocks: normalizedBlocks,
              content: composeArticleMarkdown(normalizedBlocks, normalizedEditorialBlocks),
              editorialBlocks: normalizedEditorialBlocks,
            }

            if (!isCancelled) {
              setStagedArticle(normalizedExisting)
            }

            const blocksChanged = JSON.stringify(existing.blocks) !== JSON.stringify(normalizedBlocks)
            const editorialChanged = JSON.stringify(existing.editorialBlocks || []) !== JSON.stringify(normalizedEditorialBlocks)
            const contentChanged = existing.content !== normalizedExisting.content
            if (blocksChanged || editorialChanged || contentChanged) {
              allStaged[existingIndex] = normalizedExisting
              localStorage.setItem(storageKey, JSON.stringify(allStaged))
            }

            navigate(`${routes.stageArticlePath}?stagedId=${existing.id}`, {
              replace: true,
            })
          } else {
            let markdown = urlContent
            if (!markdown) {
              const result = await fetchResult(urlRunId)
              markdown = result.markdown || ''
            }

            if (!markdown.trim()) {
              if (!isCancelled) {
                setError('Unable to load article content for staging')
              }
              return
            }

            // Create new staged article
            const extracted = extractEditorialBlocks(markdown)
            const parsedDetails = parseMarkdownToBlocksDetailed(extracted.bodyMarkdown)
            const blocks = parsedDetails.blocks
            const editorialBlocks = attachEditorialBlocksToContentBlocks(
              blocks,
              parsedDetails.ranges,
              extracted.editorialBlocks
            )
            const newStaged: StagedArticle = {
              id: `staged_${Date.now()}`,
              runId: urlRunId,
              originalTitle: urlTitle,
              originalContent: extracted.bodyMarkdown,
              originalType: urlType,
              title: urlTitle,
              content: composeArticleMarkdown(blocks, editorialBlocks),
              blocks,
              editorialBlocks,
              lexicalConverted: false,
              publishedToPayload: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }

            // Save to storage
            const updated = [...allStaged, newStaged]
            localStorage.setItem(storageKey, JSON.stringify(updated))

            if (!isCancelled) {
              setStagedArticle(newStaged)
            }
            navigate(`${routes.stageArticlePath}?stagedId=${newStaged.id}`, {
              replace: true,
            })
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load staged article')
        }
      }
    }

    void loadStagedArticle()
    return () => {
      isCancelled = true
    }
  }, [
    urlRunId,
    stagedId,
    urlTitle,
    urlContent,
    urlType,
    navigate,
    storageKey,
    routes.stageArticlePath,
    fetchResult,
  ])

  // Load reference data
  useEffect(() => {
    if (!token) return

    const loadData = async () => {
      try {
        const [locationsRes, mediaRes] = await Promise.all([
          fetchLocations(token, { limit: 200 }),
          fetchMediaAssets(token, { limit: 50, mimeType: 'image/' }),
        ])

        setLocations(locationsRes.docs || [])
        setMediaAssets(mediaRes.docs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [token, fetchLocations, fetchMediaAssets])

  const mergeMediaAssetsIntoState = useCallback((assets: MediaAsset[]) => {
    setMediaAssets((existingAssets) => mergeMediaAssetLists(existingAssets, assets))
  }, [])

  const closeBlockImageModal = useCallback(() => {
    setShowBlockUploadModal(false)
    setBlockImageModal(null)
    setSelectedImgBlockAssetIds([])
    setImgBlockCaption('')
    setImgTrioFormat(IMG_TRIO_DEFAULT_FORMAT)
    setImgBlockAssetsError(null)
    setIsLoadingImgBlockAssets(false)
  }, [])

  const openBlockImageModal = useCallback((
    blockId: string,
    mode: BlockImageModalMode,
    options?: OpenBlockImageModalOptions
  ) => {
    setBlockImageSearch('')
    setShowBlockUploadModal(false)
    setSelectedImgBlockAssetIds(options?.selectedAssetIds || [])
    setImgBlockCaption(options?.caption || '')
    setImgTrioFormat(options?.trioFormat || IMG_TRIO_DEFAULT_FORMAT)
    setImgBlockAssetsError(null)
    setOpenImagePickerTarget(null)
    setBlockImageModal({
      blockId,
      show: true,
      mode,
      replaceExistingBlock: options?.replaceExistingBlock === true,
    })
  }, [])

  useEffect(() => {
    if (!blockImageModal || blockImageModal.mode === 'default') return
    if (!token) {
      setImgBlockAssets([])
      setSelectedImgBlockAssetIds([])
      return
    }

    const loadFilteredAssets = async () => {
      setIsLoadingImgBlockAssets(true)
      setImgBlockAssetsError(null)

      let width = IMG_BLOCK_MIN_WIDTH
      let height = IMG_BLOCK_MIN_HEIGHT
      if (blockImageModal.mode === 'img-trio') {
        const dims = getImgTrioDimensions(imgTrioFormat)
        width = dims.width
        height = dims.height
      }

      try {
        const response = await fetchMediaAssets(token, {
          limit: 200,
          mimeType: 'image/',
          width,
          height,
        })
        const docs = response.docs || []
        setImgBlockAssets(docs)
        const allowedAssetIds = new Set(docs.map((asset) => asset.id))
        const requiredCount = blockImageModal.mode === 'img-trio'
          ? IMG_TRIO_REQUIRED_IMAGE_COUNT
          : IMG_PAIR_REQUIRED_IMAGE_COUNT
        setSelectedImgBlockAssetIds((current) =>
          current
            .filter((id) => allowedAssetIds.has(id))
            .slice(0, requiredCount)
        )
        mergeMediaAssetsIntoState(docs)
      } catch (err) {
        setImgBlockAssets([])
        setSelectedImgBlockAssetIds([])
        setImgBlockAssetsError(
          err instanceof Error
            ? err.message
            : 'Failed to load filtered image assets'
        )
      } finally {
        setIsLoadingImgBlockAssets(false)
      }
    }

    void loadFilteredAssets()
  }, [blockImageModal, token, fetchMediaAssets, mergeMediaAssetsIntoState, imgTrioFormat])

  const toggleImgBlockAssetSelection = useCallback((
    assetId: number,
    requiredCount: number
  ) => {
    setSelectedImgBlockAssetIds((current) => {
      if (current.includes(assetId)) {
        return current.filter((id) => id !== assetId)
      }
      if (current.length >= requiredCount) {
        return [...current.slice(1), assetId]
      }
      return [...current, assetId]
    })
  }, [])

  const updateStagedArticle = useCallback((updates: Partial<StagedArticle>) => {
    setStagedArticle(prev => {
      if (!prev) return null
      const updated = { ...prev, ...updates, updatedAt: new Date().toISOString() }

      updated.content = composeArticleMarkdown(
        updated.blocks || [],
        updated.editorialBlocks || []
      )

      // Update in localStorage
      const stored = localStorage.getItem(storageKey)
      const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []
      const index = allStaged.findIndex(s => s.id === updated.id)
      if (index >= 0) {
        allStaged[index] = updated
        localStorage.setItem(storageKey, JSON.stringify(allStaged))
      }

      return updated
    })
  }, [storageKey])

  const editorialPublishAnalysis = useMemo(
    () => buildEditorialPublishAnalysis(stagedArticle?.editorialBlocks || []),
    [stagedArticle?.editorialBlocks]
  )

  const timelineItems = useMemo(
    () => buildTimelineItems(stagedArticle?.blocks || [], stagedArticle?.editorialBlocks || []),
    [stagedArticle?.blocks, stagedArticle?.editorialBlocks]
  )

  useEffect(() => {
    if (!activeEditingTimelineItemId) return
    const stillExists = timelineItems.some((item) => item.id === activeEditingTimelineItemId)
    if (!stillExists) {
      setActiveEditingTimelineItemId(null)
    }
  }, [timelineItems, activeEditingTimelineItemId])

  useEffect(() => {
    if (!stagedArticle?.publishedToPayload) return
    if (!activeEditingTimelineItemId) return
    setActiveEditingTimelineItemId(null)
  }, [stagedArticle?.publishedToPayload, activeEditingTimelineItemId])

  const toggleTimelineItemEdit = useCallback((timelineItemId: string) => {
    setActiveEditingTimelineItemId((current) => (
      current === timelineItemId ? null : timelineItemId
    ))
  }, [])

  const applyTimelineReorder = useCallback((nextTimelineItems: TimelineItem[]) => {
    if (!stagedArticle) return

    const reordered = applyTimelineItemsToDraft(
      nextTimelineItems,
      stagedArticle.blocks,
      stagedArticle.editorialBlocks
    )

    updateStagedArticle({
      blocks: reordered.blocks,
      editorialBlocks: reordered.editorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const moveTimelineItem = useCallback((
    timelineItemId: string,
    direction: 'up' | 'down'
  ) => {
    if (!stagedArticle) return
    const currentIndex = timelineItems.findIndex((item) => item.id === timelineItemId)
    if (currentIndex === -1) return

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= timelineItems.length) return

    const reorderedTimeline = [...timelineItems]
    const [movedItem] = reorderedTimeline.splice(currentIndex, 1)
    reorderedTimeline.splice(targetIndex, 0, movedItem)
    applyTimelineReorder(reorderedTimeline)
  }, [stagedArticle, timelineItems, applyTimelineReorder])

  const fixEditorialBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return

    const target = stagedArticle.editorialBlocks.find((block) => block.id === blockId)
    if (!target) return

    const validation = validateEditorialBlockForPublish(target)
    if (validation.status === 'unsupported') {
      setPublishResult({
        success: false,
        message: `Cannot auto-fix unsupported component "${target.component}" yet.`,
      })
      return
    }

    const startMatch = validation.correctedMarkdown.match(/\[!EDITORIAL-BLOCK-START\|([^\]]+)\]/i)
    const labelMatch = validation.correctedMarkdown.match(/\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]/i)
    const correctedComponent = startMatch
      ? normalizeEditorialComponentKey(startMatch[1])
      : normalizeEditorialComponentKey(target.component)
    const defaultLabel =
      correctedComponent === PULL_QUOTE_COMPONENT
        ? PULL_QUOTE_LABEL
        : correctedComponent === IN_THE_KNOW_COMPONENT
          ? IN_THE_KNOW_LABEL
          : KEY_TAKEAWAYS_LABEL
    const correctedLabel = labelMatch?.[1]?.trim() || target.label || defaultLabel

    const updatedEditorialBlocks = stagedArticle.editorialBlocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            component: correctedComponent,
            label: correctedLabel,
            markdown: validation.correctedMarkdown,
          }
        : block
    )

    updateStagedArticle({
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
    setPublishResult(null)
  }, [stagedArticle, updateStagedArticle])

  const updateEditorialBlockMarkdown = useCallback((blockId: string, nextMarkdown: string) => {
    if (!stagedArticle) return

    const updatedEditorialBlocks = stagedArticle.editorialBlocks.map((block) => {
      if (block.id !== blockId) return block

      const startMatch = nextMarkdown.match(/^\s*>\s*\[!EDITORIAL-BLOCK-START\|([^\]]+)\]\s*$/im)
      const labelMatch = nextMarkdown.match(/^\s*>\s*\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]\s*$/im)

      return {
        ...block,
        component: startMatch
          ? normalizeEditorialComponentKey(startMatch[1]) || block.component
          : block.component,
        label: labelMatch?.[1]?.trim() || block.label,
        markdown: nextMarkdown,
      }
    })

    updateStagedArticle({
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const removeEditorialBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return

    const target = stagedArticle.editorialBlocks.find((block) => block.id === blockId)
    if (!target) return

    const blockLabel = target.label?.trim() || 'this editorial block'
    if (!confirm(`Remove "${blockLabel}"?`)) return

    const updatedEditorialBlocks = stagedArticle.editorialBlocks.filter(
      (block) => block.id !== blockId
    )

    updateStagedArticle({
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
    setPublishResult(null)
  }, [stagedArticle, updateStagedArticle])

  // Block operations
  const updateBlockContent = useCallback((blockId: string, newContent: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId ? { ...b, content: newContent } : b
    )
    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const reanchorEditorialBlocksAfterBlockRemoval = useCallback((
    removedBlockId: string,
    fallbackAfterBlockId: string | null
  ): EditorialBlock[] => {
    if (!stagedArticle) return []

    return (stagedArticle.editorialBlocks || []).map((editorialBlock) => {
      if (editorialBlock.afterBlockId !== removedBlockId) {
        return editorialBlock
      }

      return {
        ...editorialBlock,
        afterBlockId: fallbackAfterBlockId,
        placeAfterImage: false,
      }
    })
  }, [stagedArticle])

  const createMediaBlockId = () => (
    `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  )

  const addImageAfterBlock = useCallback((
    blockId: string,
    imageId: number,
    imageAfterAltText?: string,
    replaceExisting = false
  ) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex((b) => b.id === blockId)
    if (blockIndex === -1) return
    const targetBlock = stagedArticle.blocks[blockIndex]

    if (replaceExisting && targetBlock.type === 'image') {
      const updatedBlocks = stagedArticle.blocks.map((b) =>
        b.id === blockId
          ? createSingleImageBlock(blockId, imageId, imageAfterAltText)
          : b
      )
      updateStagedArticle({ blocks: updatedBlocks })
      return
    }

    const newImageBlock = createSingleImageBlock(
      createMediaBlockId(),
      imageId,
      imageAfterAltText
    )
    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex + 1),
      newImageBlock,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const addImgPairAfterBlock = useCallback((
    blockId: string,
    imageOne: MediaAsset,
    imageTwo: MediaAsset,
    caption?: string,
    replaceExisting = false
  ) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex((b) => b.id === blockId)
    if (blockIndex === -1) return
    const targetBlock = stagedArticle.blocks[blockIndex]

    if (replaceExisting && targetBlock.type === 'img-pair') {
      const updatedBlocks = stagedArticle.blocks.map((b) =>
        b.id === blockId
          ? createImgPairBlock(
              blockId,
              imageOne.id,
              imageTwo.id,
              caption
            )
          : b
      )
      updateStagedArticle({ blocks: updatedBlocks })
      return
    }

    const newPairBlock = createImgPairBlock(
      createMediaBlockId(),
      imageOne.id,
      imageTwo.id,
      caption
    )
    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex + 1),
      newPairBlock,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const addImgTrioAfterBlock = useCallback((
    blockId: string,
    format: ImgTrioFormat,
    imageOne: MediaAsset,
    imageTwo: MediaAsset,
    imageThree: MediaAsset,
    caption?: string,
    replaceExisting = false
  ) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex((b) => b.id === blockId)
    if (blockIndex === -1) return
    const targetBlock = stagedArticle.blocks[blockIndex]

    if (replaceExisting && targetBlock.type === 'img-trio') {
      const updatedBlocks = stagedArticle.blocks.map((b) =>
        b.id === blockId
          ? createImgTrioBlock(
              blockId,
              format,
              imageOne.id,
              imageTwo.id,
              imageThree.id,
              caption
            )
          : b
      )
      updateStagedArticle({ blocks: updatedBlocks })
      return
    }

    const newTrioBlock = createImgTrioBlock(
      createMediaBlockId(),
      format,
      imageOne.id,
      imageTwo.id,
      imageThree.id,
      caption
    )
    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex + 1),
      newTrioBlock,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const updateMediaGroupCaption = useCallback((blockId: string, caption: string) => {
    if (!stagedArticle) return

    const updatedBlocks = stagedArticle.blocks.map((b) => {
      if (b.id !== blockId) return b
      if (b.type === 'img-pair' && b.imgPairAfter) {
        return createImgPairBlock(
          b.id,
          b.imgPairAfter.imageOne,
          b.imgPairAfter.imageTwo,
          caption
        )
      }
      if (b.type === 'img-trio' && b.imgTrioAfter) {
        return createImgTrioBlock(
          b.id,
          b.imgTrioAfter.format,
          b.imgTrioAfter.imageOne,
          b.imgTrioAfter.imageTwo,
          b.imgTrioAfter.imageThree,
          caption
        )
      }
      if (b.imgPairAfter) {
        return {
          ...b,
          imgPairAfter: {
            ...b.imgPairAfter,
            caption: caption || undefined,
          },
        }
      }
      if (b.imgTrioAfter) {
        return {
          ...b,
          imgTrioAfter: {
            ...b.imgTrioAfter,
            caption: caption || undefined,
          },
        }
      }
      return b
    })

    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const removeImageAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const removedIndex = stagedArticle.blocks.findIndex((b) => b.id === blockId)
    const targetBlock = stagedArticle.blocks.find((b) => b.id === blockId)
    if (targetBlock?.type === 'image') {
      const fallbackAfterBlockId = removedIndex > 0
        ? stagedArticle.blocks[removedIndex - 1].id
        : null
      const updatedEditorialBlocks = reanchorEditorialBlocksAfterBlockRemoval(
        blockId,
        fallbackAfterBlockId
      )
      updateStagedArticle({
        blocks: stagedArticle.blocks.filter((b) => b.id !== blockId),
        editorialBlocks: updatedEditorialBlocks,
      })
      return
    }
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId ? { ...b, imageAfter: undefined, imageAfterAltText: undefined } : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, reanchorEditorialBlocksAfterBlockRemoval, updateStagedArticle])

  const removeImgPairAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const removedIndex = stagedArticle.blocks.findIndex((b) => b.id === blockId)
    const targetBlock = stagedArticle.blocks.find((b) => b.id === blockId)
    if (targetBlock?.type === 'img-pair') {
      const fallbackAfterBlockId = removedIndex > 0
        ? stagedArticle.blocks[removedIndex - 1].id
        : null
      const updatedEditorialBlocks = reanchorEditorialBlocksAfterBlockRemoval(
        blockId,
        fallbackAfterBlockId
      )
      updateStagedArticle({
        blocks: stagedArticle.blocks.filter((b) => b.id !== blockId),
        editorialBlocks: updatedEditorialBlocks,
      })
      return
    }
    const updatedBlocks = stagedArticle.blocks.map((b) =>
      b.id === blockId ? { ...b, imgPairAfter: undefined } : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, reanchorEditorialBlocksAfterBlockRemoval, updateStagedArticle])

  const removeImgTrioAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const removedIndex = stagedArticle.blocks.findIndex((b) => b.id === blockId)
    const targetBlock = stagedArticle.blocks.find((b) => b.id === blockId)
    if (targetBlock?.type === 'img-trio') {
      const fallbackAfterBlockId = removedIndex > 0
        ? stagedArticle.blocks[removedIndex - 1].id
        : null
      const updatedEditorialBlocks = reanchorEditorialBlocksAfterBlockRemoval(
        blockId,
        fallbackAfterBlockId
      )
      updateStagedArticle({
        blocks: stagedArticle.blocks.filter((b) => b.id !== blockId),
        editorialBlocks: updatedEditorialBlocks,
      })
      return
    }
    const updatedBlocks = stagedArticle.blocks.map((b) =>
      b.id === blockId ? { ...b, imgTrioAfter: undefined } : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, reanchorEditorialBlocksAfterBlockRemoval, updateStagedArticle])

  const mergeWithNextBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex(b => b.id === blockId)
    if (blockIndex === -1 || blockIndex >= stagedArticle.blocks.length - 1) return

    const currentBlock = stagedArticle.blocks[blockIndex]
    const nextBlock = stagedArticle.blocks[blockIndex + 1]

    if (!isTextualBlock(currentBlock) || !isTextualBlock(nextBlock)) return

    // Merge text content of adjacent textual blocks.
    const mergedBlock: ContentBlock = {
      id: currentBlock.id,
      type: currentBlock.type === 'pullquote' ? 'pullquote' : 'text',
      content: `${currentBlock.content}\n\n${nextBlock.content}`,
    }

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      mergedBlock,
      ...stagedArticle.blocks.slice(blockIndex + 2),
    ]

    const updatedEditorialBlocks = (stagedArticle.editorialBlocks || []).map((editorialBlock) => {
      if (editorialBlock.afterBlockId !== nextBlock.id) {
        return editorialBlock
      }

      return {
        ...editorialBlock,
        afterBlockId: currentBlock.id,
      }
    })

    updateStagedArticle({
      blocks: updatedBlocks,
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const resetToOriginalBlocks = useCallback(() => {
    if (!stagedArticle) return
    if (!confirm('Reset all blocks to the original content? This will remove any edits and images between blocks.')) return

    const blocks = parseMarkdownToBlocks(stagedArticle.originalContent)
    updateStagedArticle({
      blocks,
      lexicalConverted: false
    })
  }, [stagedArticle, updateStagedArticle])

  // Find header positions within a block's content for split points
  const findHeaderSplitPoints = useCallback((content: string): { lineIndex: number; headerText: string }[] => {
    const lines = content.split('\n')
    const splitPoints: { lineIndex: number; headerText: string }[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^#{1,6}\s/.test(line) && i > 0) {
        // Found a header that's not at the start - this is a split point
        splitPoints.push({ lineIndex: i, headerText: line.replace(/^#+\s*/, '') })
      }
    }

    return splitPoints
  }, [])

  const splitBlockAtHeader = useCallback((blockId: string, lineIndex: number) => {
    if (!stagedArticle) return

    const blockIndex = stagedArticle.blocks.findIndex(b => b.id === blockId)
    if (blockIndex === -1) return

    const block = stagedArticle.blocks[blockIndex]
    if (!isTextualBlock(block)) return
    const lines = block.content.split('\n')
    const secondBlockId = `block_${Date.now()}`

    // Split content at the header line
    const beforeContent = lines.slice(0, lineIndex).join('\n').trim()
    const afterContent = lines.slice(lineIndex).join('\n').trim()

    if (!beforeContent || !afterContent) return

    const newBlocks: ContentBlock[] = [
      {
        id: block.id,
        type: block.type === 'pullquote' ? 'pullquote' : 'text',
        content: beforeContent,
      },
      {
        id: secondBlockId,
        type: block.type === 'pullquote' ? 'pullquote' : 'text',
        content: afterContent,
      },
    ]

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      ...newBlocks,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]

    const updatedEditorialBlocks = (stagedArticle.editorialBlocks || []).map((editorialBlock) => {
      if (editorialBlock.afterBlockId !== block.id) {
        return editorialBlock
      }

      // Keep editorial blocks at the end of the original section after split.
      return {
        ...editorialBlock,
        afterBlockId: secondBlockId,
      }
    })

    updateStagedArticle({
      blocks: updatedBlocks,
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const addNewBlock = useCallback((afterBlockId?: string) => {
    if (!stagedArticle) return

    const newBlock: ContentBlock = {
      id: `block_${Date.now()}`,
      type: 'text',
      content: '## New Section\n\nAdd your content here...',
    }

    let updatedBlocks: ContentBlock[]

    if (afterBlockId) {
      const blockIndex = stagedArticle.blocks.findIndex(b => b.id === afterBlockId)
      if (blockIndex === -1) return
      updatedBlocks = [
        ...stagedArticle.blocks.slice(0, blockIndex + 1),
        newBlock,
        ...stagedArticle.blocks.slice(blockIndex + 1),
      ]
    } else {
      // Add at the end
      updatedBlocks = [...stagedArticle.blocks, newBlock]
    }

    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
    setActiveEditingTimelineItemId(getContentTimelineItemId(newBlock.id))
  }, [stagedArticle, updateStagedArticle])

  const addNewEditorialBlock = useCallback((
    component: SupportedEditorialComponent,
    afterBlockId?: string
  ) => {
    if (!stagedArticle) return

    const { label, markdown } = buildDefaultEditorialTemplate(component)
    const validAfterBlockId = afterBlockId
      && stagedArticle.blocks.some((block) => block.id === afterBlockId)
      ? afterBlockId
      : stagedArticle.blocks.length > 0
        ? stagedArticle.blocks[stagedArticle.blocks.length - 1].id
        : null

    const newEditorialBlock: EditorialBlock = {
      id: `editorial_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      component,
      label,
      markdown,
      afterBlockId: validAfterBlockId,
      placeAfterImage: false,
    }

    updateStagedArticle({
      editorialBlocks: [...stagedArticle.editorialBlocks, newEditorialBlock],
      lexicalConverted: false,
    })
    setActiveEditingTimelineItemId(getEditorialTimelineItemId(newEditorialBlock.id))
    setPublishResult(null)
  }, [stagedArticle, updateStagedArticle])

  const toggleEditorialPicker = useCallback((target: string) => {
    setOpenEditorialPickerTarget((current) => (
      current === target ? null : target
    ))
  }, [])

  const toggleImagePicker = useCallback((target: string) => {
    setOpenImagePickerTarget((current) => (
      current === target ? null : target
    ))
  }, [])

  const addEditorialFromPicker = useCallback((
    component: SupportedEditorialComponent,
    afterBlockId?: string,
    placeAfterImage?: boolean
  ) => {
    void placeAfterImage
    addNewEditorialBlock(component, afterBlockId)
    setOpenEditorialPickerTarget(null)
  }, [addNewEditorialBlock])

  const deleteBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    if (stagedArticle.blocks.length <= 1) {
      alert('Cannot delete the last block.')
      return
    }

    const block = stagedArticle.blocks.find(b => b.id === blockId)
    if (!block) return

    const hasMedia = Boolean(getBlockMediaPayload(block))
    const message = hasMedia
      ? 'Delete this block and its media block?'
      : 'Delete this block?'

    if (!confirm(message)) return

    const removedIndex = stagedArticle.blocks.findIndex((candidate) => candidate.id === blockId)
    const fallbackAfterBlockId = removedIndex > 0
      ? stagedArticle.blocks[removedIndex - 1].id
      : null
    const updatedBlocks = stagedArticle.blocks.filter(b => b.id !== blockId)
    const updatedEditorialBlocks = reanchorEditorialBlocksAfterBlockRemoval(
      blockId,
      fallbackAfterBlockId
    )
    updateStagedArticle({
      blocks: updatedBlocks,
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, reanchorEditorialBlocksAfterBlockRemoval, updateStagedArticle])

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, timelineItemId: string) => {
    setDraggedTimelineItemId(timelineItemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', timelineItemId)
    // Add a slight delay to allow the drag image to be captured
    setTimeout(() => {
      const element = document.querySelector(`[data-timeline-id="${timelineItemId}"]`)
      if (element) {
        element.classList.add('dragging')
      }
    }, 0)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedTimelineItemId(null)
    setDragOverTimelineItemId(null)
    // Remove dragging class from all blocks
    document.querySelectorAll('.block-editor-item').forEach(el => {
      el.classList.remove('dragging')
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, timelineItemId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (timelineItemId !== draggedTimelineItemId) {
      setDragOverTimelineItemId(timelineItemId)
    }
  }, [draggedTimelineItemId])

  const handleDragLeave = useCallback(() => {
    setDragOverTimelineItemId(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetTimelineItemId: string) => {
    e.preventDefault()
    if (!stagedArticle || !draggedTimelineItemId || draggedTimelineItemId === targetTimelineItemId) {
      setDraggedTimelineItemId(null)
      setDragOverTimelineItemId(null)
      return
    }

    const reorderedTimeline = [...timelineItems]
    const draggedIndex = reorderedTimeline.findIndex((item) => item.id === draggedTimelineItemId)
    const targetIndex = reorderedTimeline.findIndex((item) => item.id === targetTimelineItemId)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTimelineItemId(null)
      setDragOverTimelineItemId(null)
      return
    }

    // Remove the dragged item
    const [draggedItem] = reorderedTimeline.splice(draggedIndex, 1)

    // Match youtube2blog drop behavior: dropping on an item inserts above it.
    const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
    reorderedTimeline.splice(newTargetIndex, 0, draggedItem)

    applyTimelineReorder(reorderedTimeline)
    setDraggedTimelineItemId(null)
    setDragOverTimelineItemId(null)
  }, [stagedArticle, draggedTimelineItemId, timelineItems, applyTimelineReorder])

  const handlePublish = async () => {
    if (!token || !stagedArticle) return

    const trimmedTitle = stagedArticle.title.trim()
    const location = locations.find(l => l.id === stagedArticle.locationId)
    const featuredImage =
      stagedArticle.featuredImageId
        ? findPreferredVariantAsset(stagedArticle.featuredImageId, FEATURED_IMAGE_VARIANT)
        : null

    if (!trimmedTitle) {
      setPublishResult({
        success: false,
        message: 'Please enter an article title'
      })
      return
    }

    if (!location || !featuredImage) {
      setPublishResult({
        success: false,
        message: !location ? 'Please select a location' : 'Please select a featured image'
      })
      return
    }

    setIsPublishing(true)
    setPublishResult(null)
    setIsConverting(true)

    try {
      const blockById = new Map(stagedArticle.blocks.map((block) => [block.id, block]))
      const editorialById = new Map(
        (stagedArticle.editorialBlocks || []).map((block) => [block.id, block])
      )
      const contentBlocks: PayloadContentBlock[] = []
      const processedBlockIds = new Set<string>()
      const processedEditorialIds = new Set<string>()
      let textBlocksAdded = 0

      // Publish in exact UI stack order.
      for (const [timelineIndex, timelineItem] of timelineItems.entries()) {
        if (timelineItem.type === 'editorial') {
          const editorialBlock = editorialById.get(timelineItem.editorialBlockId)
          if (!editorialBlock || processedEditorialIds.has(editorialBlock.id)) continue
          const validation = editorialPublishAnalysis.byId[editorialBlock.id]
          if (!validation || validation.status !== 'supported') continue
          contentBlocks.push(validation.payloadBlock)
          processedEditorialIds.add(editorialBlock.id)
          continue
        }

        const block = blockById.get(timelineItem.contentBlockId)
        if (!block || processedBlockIds.has(block.id)) continue
        processedBlockIds.add(block.id)

        if (timelineItem.type === 'content') {
          const markdown = block.content.trim()
          if (!markdown) continue
          const lexicalResult = await convertMarkdownToLexical(markdown)
          if (!lexicalResult.success || !lexicalResult.data) {
            throw new Error(
              lexicalResult.error
              || `Failed to convert block ${timelineIndex + 1} to Lexical`
            )
          }

          contentBlocks.push({
            blockType: 'text',
            content: lexicalResult.data,
          })
          textBlocksAdded += 1
          continue
        }

        const mediaPayload = getBlockMediaPayload(block)
        if (!mediaPayload) continue

        if (mediaPayload.type === 'single') {
          const imageAsset = mediaAssets.find((m) => m.id === mediaPayload.imageAfter)
          const altText = (
            mediaPayload.imageAfterAltText?.trim()
            || getMediaAssetAltText(imageAsset)
          ).trim()
          if (!altText) {
            throw new Error(`Image block ${timelineIndex + 1} is missing alt text`)
          }

          contentBlocks.push({
            blockType: 'image',
            image: mediaPayload.imageAfter,
            altText,
          })
          continue
        }

        if (mediaPayload.type === 'pair') {
          const imageOneAsset = mediaAssets.find((m) => m.id === mediaPayload.imgPairAfter.imageOne)
          const imageTwoAsset = mediaAssets.find((m) => m.id === mediaPayload.imgPairAfter.imageTwo)
          if (!hasExactImgBlockDimensions(imageOneAsset) || !hasExactImgBlockDimensions(imageTwoAsset)) {
            throw new Error(
              `Img pair block ${timelineIndex + 1} must be exactly ${IMG_BLOCK_MIN_WIDTH}x${IMG_BLOCK_MIN_HEIGHT}`
            )
          }

          contentBlocks.push({
            blockType: 'img-pair',
            imageOne: mediaPayload.imgPairAfter.imageOne,
            imageTwo: mediaPayload.imgPairAfter.imageTwo,
            caption: mediaPayload.imgPairAfter.caption?.trim() || undefined,
          })
          continue
        }

        const imageOneAsset = mediaAssets.find((m) => m.id === mediaPayload.imgTrioAfter.imageOne)
        const imageTwoAsset = mediaAssets.find((m) => m.id === mediaPayload.imgTrioAfter.imageTwo)
        const imageThreeAsset = mediaAssets.find((m) => m.id === mediaPayload.imgTrioAfter.imageThree)
        if (
          !hasExactImgTrioDimensions(imageOneAsset, mediaPayload.imgTrioAfter.format)
          || !hasExactImgTrioDimensions(imageTwoAsset, mediaPayload.imgTrioAfter.format)
          || !hasExactImgTrioDimensions(imageThreeAsset, mediaPayload.imgTrioAfter.format)
        ) {
          const dims = getImgTrioDimensions(mediaPayload.imgTrioAfter.format)
          throw new Error(
            `Img trio block ${timelineIndex + 1} must be exactly ${dims.width}x${dims.height}`
          )
        }

        contentBlocks.push({
          blockType: 'img-trio',
          format: mediaPayload.imgTrioAfter.format,
          imageOne: mediaPayload.imgTrioAfter.imageOne,
          imageTwo: mediaPayload.imgTrioAfter.imageTwo,
          imageThree: mediaPayload.imgTrioAfter.imageThree,
          caption: mediaPayload.imgTrioAfter.caption?.trim() || undefined,
        })
      }

      if (textBlocksAdded === 0) {
        throw new Error('Add at least one text block with content before publishing')
      }

      setIsConverting(false)

      const result = await createArticle({
        title: trimmedTitle,
        location: location.locationKey,
        locationRef: location.id,
        step1_complete: true,
        status: 'draft',
        headerSection: {
          featuredImage: featuredImage.id,
        },
        contentBlocks,
      }, token)

      // Mark as synced in the backend database
      await markArticleSynced(stagedArticle.runId, result.id)

      // Update staged article with publish status
      updateStagedArticle({
        publishedToPayload: true,
        payloadArticleId: result.id,
        lexicalConverted: true,
      })

      setPublishResult({
        success: true,
        message: `Published! Article ID: ${result.id}`
      })
    } catch (err) {
      setPublishResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to publish'
      })
    } finally {
      setIsPublishing(false)
      setIsConverting(false)
    }
  }

  const handleDelete = () => {
    if (!stagedArticle) return
    if (!confirm('Delete this staged article?')) return

    const stored = localStorage.getItem(storageKey)
    const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []
    const updated = allStaged.filter(s => s.id !== stagedArticle.id)
    localStorage.setItem(storageKey, JSON.stringify(updated))

    navigate(routes.stagePath)
  }

  const findPreferredVariantAsset = useCallback((assetId: number, preferredVariant: MediaVariant): MediaAsset | null => {
    const selectedAsset = mediaAssets.find(m => m.id === assetId)
    if (!selectedAsset) return null

    const mediaSetId = getRelationshipId(selectedAsset.mediaSet)
    if (mediaSetId === null || !selectedAsset.variant) {
      return selectedAsset
    }

    const preferred = mediaAssets.find(m => {
      const candidateMediaSetId = getRelationshipId(m.mediaSet)
      return candidateMediaSetId !== null
        && String(candidateMediaSetId) === String(mediaSetId)
        && m.variant === preferredVariant
    })

    return preferred || selectedAsset
  }, [mediaAssets])

  const handleUploadComplete = (result: UploadImageResponse) => {
    const featuredAssetId = pickVariantAssetId(result.variantAssetIds, FEATURED_IMAGE_VARIANT)
    if (featuredAssetId) {
      updateStagedArticle({ featuredImageId: featuredAssetId })
    }

    if (token) {
      fetchMediaAssets(token, { limit: 50, mimeType: 'image/' })
        .then(res => mergeMediaAssetsIntoState(res.docs || []))
    }

    setShowUploadModal(false)
    setShowImageModal(false)
    setImageAltText('')
    setImagePhotographerCredit('')
  }

  const handleBlockImageUploadComplete = (result: UploadImageResponse) => {
    if (!blockImageModal) return
    if (blockImageModal.mode !== 'default') {
      setShowBlockUploadModal(false)
      return
    }

    const blockAssetId = pickVariantAssetId(result.variantAssetIds, CONTENT_BLOCK_VARIANT)
    if (blockAssetId) {
      addImageAfterBlock(
        blockImageModal.blockId,
        blockAssetId,
        blockImageAltText,
        blockImageModal.replaceExistingBlock === true
      )
    }

    if (token) {
      fetchMediaAssets(token, { limit: 50, mimeType: 'image/' })
        .then(res => mergeMediaAssetsIntoState(res.docs || []))
    }

    closeBlockImageModal()
    setBlockImageAltText('')
    setBlockImagePhotographerCredit('')
  }

  const getLocationDisplayName = (loc?: Location) => {
    if (!loc) return ''
    return loc.neighborhoodName || loc.cityName || loc.countryName || loc.locationKey
  }

  const getImageUrl = (img: MediaAsset) => {
    return img.url || `${import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'}/api/media-assets/file/${img.filename}`
  }

  if (isLoading || !stagedArticle) {
    return (
      <div className="stage-article-page">
        <div className="stage-article-loading">
          <div className="stage-article-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stage-article-page">
        <div className="stage-article-error">
          <h2>Error</h2>
          <p>{error}</p>
          <Link to={routes.articlesPath} className="stage-article-btn">Back to Articles</Link>
        </div>
      </div>
    )
  }

  const selectedLocation = locations.find(l => l.id === stagedArticle.locationId)
  const selectedFeaturedImage =
    stagedArticle.featuredImageId
      ? findPreferredVariantAsset(stagedArticle.featuredImageId, FEATURED_IMAGE_VARIANT)
      : null
  const hasValidUploadLocation = Boolean(selectedLocation?.id)
  const uploadLocationRequirementMessage =
    'Select a valid location before uploading new images.'
  const featuredImageFileNamePrefix = buildImageFileNamePrefix(
    stagedArticle.title,
    stagedArticle.id
  )
  const blockImageExternalRef = blockImageModal
    ? `${stagedArticle.id}_block_${blockImageModal.blockId}`
    : ''
  const blockImageFileNamePrefix = blockImageExternalRef
    ? buildImageFileNamePrefix(stagedArticle.title, blockImageExternalRef)
    : undefined
  const lastContentBlock = stagedArticle.blocks.length > 0
    ? stagedArticle.blocks[stagedArticle.blocks.length - 1]
    : null
  const canAddImageAfterBlock = (block: ContentBlock) => Boolean(block.id)
  const renderImagePicker = (blockId: string, pickerKey: string) => (
    <div className="block-editorial-picker">
      <button
        type="button"
        className={`block-add-editorial-trigger ${openImagePickerTarget === pickerKey ? 'active' : ''}`}
        onClick={() => toggleImagePicker(pickerKey)}
        title="Choose image block"
      >
        Image
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {openImagePickerTarget === pickerKey && (
        <div className="block-editorial-picker-menu">
          {IMAGE_PICKER_OPTIONS.map((option) => (
            <button
              key={`${pickerKey}-${option.mode}`}
              type="button"
              className="block-editorial-option-btn"
              onClick={() => void openBlockImageModal(blockId, option.mode)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
  const renderEditorialPicker = (
    blockId: string,
    pickerKey: string,
    placeAfterImage = false
  ) => (
    <div className="block-editorial-picker">
      <button
        type="button"
        className={`block-add-editorial-trigger ${openEditorialPickerTarget === pickerKey ? 'active' : ''}`}
        onClick={() => toggleEditorialPicker(pickerKey)}
        title="Choose editorial block"
      >
        Editorial
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {openEditorialPickerTarget === pickerKey && (
        <div className="block-editorial-picker-menu">
          {EDITORIAL_PICKER_OPTIONS.map((option) => (
            <button
              key={`${pickerKey}-${option.component}`}
              type="button"
              className="block-editorial-option-btn"
              onClick={() => addEditorialFromPicker(option.component, blockId, placeAfterImage)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
  const contentBlockById = new Map(stagedArticle.blocks.map((block) => [block.id, block]))
  const editorialBlockById = new Map(stagedArticle.editorialBlocks.map((block) => [block.id, block]))
  const contentBlockIndexMap = new Map(stagedArticle.blocks.map((block, index) => [block.id, index]))
  const timelineIndexMap = new Map(timelineItems.map((item, index) => [item.id, index]))
  const contentTimelineNumberMap = new Map<string, number>()
  const editorialTimelineNumberMap = new Map<string, number>()
  const imageTimelineNumberMap = new Map<string, number>()
  let technicalBlockCounter = 0

  timelineItems.forEach((item) => {
    technicalBlockCounter += 1
    if (item.type === 'content') {
      contentTimelineNumberMap.set(item.contentBlockId, technicalBlockCounter)
      return
    }

    if (item.type === 'image') {
      imageTimelineNumberMap.set(item.contentBlockId, technicalBlockCounter)
      return
    }

    editorialTimelineNumberMap.set(item.editorialBlockId, technicalBlockCounter)
  })

  const totalTechnicalBlockCount = technicalBlockCounter
  const hasTitle = Boolean(stagedArticle.title.trim())
  const allFieldsFilled = Boolean(
    selectedLocation
    && selectedFeaturedImage
    && hasTitle
  )
  const hasMissingFeaturedImage = !selectedFeaturedImage
  const isImgBlockModal = blockImageModal?.mode === 'img'
  const isImgTrioModal = blockImageModal?.mode === 'img-trio'
  const isMultiImageModal = isImgBlockModal || isImgTrioModal
  const blockImageSearchableAssets = isMultiImageModal ? imgBlockAssets : mediaAssets
  const blockImageDimensionFilteredAssets = blockImageSearchableAssets.filter((img) => {
    if (isImgBlockModal) return hasExactImgBlockDimensions(img)
    if (isImgTrioModal) return hasExactImgTrioDimensions(img, imgTrioFormat)
    return true
  })
  const featuredImageVariantAssets = mediaAssets.filter((img) => {
    if (img.variant) return img.variant === FEATURED_IMAGE_VARIANT
    return hasExactFeaturedImageDimensions(img)
  })
  const filteredFeaturedImageAssets = featuredImageVariantAssets.filter((img) =>
    img.filename.toLowerCase().includes(imageSearch.toLowerCase())
    || getMediaAssetAltText(img).toLowerCase().includes(imageSearch.toLowerCase())
  )
  const blockImageVariantFilteredAssets = blockImageDimensionFilteredAssets.filter((img) => {
    if (blockImageModal?.mode !== 'default') return true
    if (img.variant) return img.variant === CONTENT_BLOCK_VARIANT
    return hasExactContentBlockDimensions(img)
  })
  const filteredBlockImageAssets = blockImageVariantFilteredAssets.filter((img) =>
    img.filename.toLowerCase().includes(blockImageSearch.toLowerCase())
    || getMediaAssetAltText(img).toLowerCase().includes(blockImageSearch.toLowerCase())
  )
  const imgTrioDimensions = getImgTrioDimensions(imgTrioFormat)
  const requiredImageCount = isImgTrioModal
    ? IMG_TRIO_REQUIRED_IMAGE_COUNT
    : IMG_PAIR_REQUIRED_IMAGE_COUNT
  const selectedImgBlockAssets = selectedImgBlockAssetIds
    .map((assetId) => blockImageDimensionFilteredAssets.find((asset) => asset.id === assetId))
    .filter((asset): asset is MediaAsset => Boolean(asset))
  const handleAddSelectedImgBlock = () => {
    if (!blockImageModal || blockImageModal.mode === 'default') return
    if (selectedImgBlockAssets.length !== requiredImageCount) return

    if (blockImageModal.mode === 'img') {
      const [rawImageOne, rawImageTwo] = selectedImgBlockAssets
      const imageOne = findPreferredVariantAsset(rawImageOne.id, IMG_BLOCK_VARIANT)
      const imageTwo = findPreferredVariantAsset(rawImageTwo.id, IMG_BLOCK_VARIANT)
      if (!imageOne || !imageTwo) return
      if (!hasExactImgBlockDimensions(imageOne) || !hasExactImgBlockDimensions(imageTwo)) {
        setPublishResult({
          success: false,
          message: `Img pair requires exactly ${IMG_BLOCK_MIN_WIDTH}x${IMG_BLOCK_MIN_HEIGHT} images`,
        })
        return
      }

      addImgPairAfterBlock(
        blockImageModal.blockId,
        imageOne,
        imageTwo,
        imgBlockCaption,
        blockImageModal.replaceExistingBlock === true
      )
      mergeMediaAssetsIntoState([imageOne, imageTwo])
      closeBlockImageModal()
      return
    }

    const [rawImageOne, rawImageTwo, rawImageThree] = selectedImgBlockAssets
    const preferredVariant = imgTrioFormat === 'square' ? 'square' : 'wide'
    const imageOne = findPreferredVariantAsset(rawImageOne.id, preferredVariant)
    const imageTwo = findPreferredVariantAsset(rawImageTwo.id, preferredVariant)
    const imageThree = findPreferredVariantAsset(rawImageThree.id, preferredVariant)
    if (!imageOne || !imageTwo || !imageThree) return

    if (
      !hasExactImgTrioDimensions(imageOne, imgTrioFormat)
      || !hasExactImgTrioDimensions(imageTwo, imgTrioFormat)
      || !hasExactImgTrioDimensions(imageThree, imgTrioFormat)
    ) {
      const dims = getImgTrioDimensions(imgTrioFormat)
      setPublishResult({
        success: false,
        message: `Img trio (${imgTrioFormat}) requires exactly ${dims.width}x${dims.height} images`,
      })
      return
    }

    addImgTrioAfterBlock(
      blockImageModal.blockId,
      imgTrioFormat,
      imageOne,
      imageTwo,
      imageThree,
      imgBlockCaption,
      blockImageModal.replaceExistingBlock === true
    )
    mergeMediaAssetsIntoState([imageOne, imageTwo, imageThree])
    closeBlockImageModal()
  }

  const renderActionZoneForBlock = (
    block: ContentBlock,
    options?: {
      showFuse?: boolean
      pickerKey?: string
      placeAfterImage?: boolean
      allowImageAdd?: boolean
    }
  ) => {
    if (stagedArticle.publishedToPayload) return null
    const showFuse = options?.showFuse ?? true
    const pickerKey = options?.pickerKey || block.id
    const placeAfterImage = options?.placeAfterImage ?? false
    const allowImageAdd = options?.allowImageAdd ?? true

    return (
      <div className="block-action-zone">
        <div className="block-action-line" />
        <div className="block-action-buttons">
          {showFuse && (
            <button
              type="button"
              className="block-fuse-btn"
              onClick={() => mergeWithNextBlock(block.id)}
              title="Fuse with next block"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 10l5 5 5-5"/>
                <path d="M7 14l5-5 5 5"/>
              </svg>
              Fuse
            </button>
          )}

          {allowImageAdd && canAddImageAfterBlock(block) && renderImagePicker(block.id, pickerKey)}

          <button
            type="button"
            className="block-add-block-btn"
            onClick={() => addNewBlock(block.id)}
            title="Add new text block here"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Block
          </button>
          {renderEditorialPicker(block.id, pickerKey, placeAfterImage)}
        </div>
      </div>
    )
  }

  return (
    <div className="stage-article-page">
      {/* Header */}
      <header className="stage-article-header">
        <div className="stage-article-header-left">
          <Link to={routes.stagePath} className="stage-article-back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Stage List
          </Link>
          <div className="stage-article-header-meta">
            <p className="stage-article-eyebrow">
              {stagedArticle.publishedToPayload ? 'Published to Payload' : 'Staging for Payload'}
            </p>
            {stagedArticle.originalType && (
              <span className="stage-article-type-badge">{stagedArticle.originalType}</span>
            )}
            {!stagedArticle.publishedToPayload && hasMissingFeaturedImage && (
              <span className="stage-article-badge missing">
                Missing featured image
              </span>
            )}
            {isConverting && (
              <span className="stage-article-badge converting">
                <span className="stage-article-badge-spinner" />
                Converting...
              </span>
            )}
            {stagedArticle.publishedToPayload && (
              <span className="stage-article-badge published">Published #{stagedArticle.payloadArticleId}</span>
            )}
          </div>
        </div>

        <div className="stage-article-actions-bar">
          {!stagedArticle.publishedToPayload && (
            <button
              type="button"
              className="stage-article-icon-btn"
              onClick={resetToOriginalBlocks}
              title="Reset to original blocks"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              Reset
            </button>
          )}
          <button
            className="stage-article-icon-btn danger"
            onClick={handleDelete}
            title="Delete staged article"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete
          </button>
        </div>
      </header>

      {/* Title Area */}
      <div className="stage-article-title-area">
        {!stagedArticle.publishedToPayload ? (
          <input
            type="text"
            className="stage-article-title-input"
            value={stagedArticle.title}
            onChange={(e) => updateStagedArticle({ title: e.target.value })}
            placeholder="Article title..."
          />
        ) : (
          <h1 className="stage-article-title">{stagedArticle.title || 'Untitled Article'}</h1>
        )}
      </div>

      {/* Two-column layout */}
      <div className="stage-article-layout">
        {/* Main content - block editor */}
        <main className="stage-article-main">
          <div className="stage-article-section">
            <div className="block-editor-header">
              <label className="stage-article-label">
                Content Blocks
                <span className="stage-article-label-hint">
                  {activeEditingTimelineItemId
                    ? 'Editing one block at a time'
                    : 'Fuse blocks or add images between them'}
                </span>
              </label>
              <span className="stage-article-block-count" title="Includes content, editorial, and image blocks">
                {totalTechnicalBlockCount} blocks
              </span>
            </div>

            <div className="block-editor">
              {timelineItems.map((timelineItem) => {
                const timelineIndex = timelineIndexMap.get(timelineItem.id) ?? 0
                const canReorder = !stagedArticle.publishedToPayload && !activeEditingTimelineItemId
                const isFirstTimelineItem = timelineIndex === 0
                const isLastTimelineItem = timelineIndex === timelineItems.length - 1
                const hasNextTimelineItem = timelineIndex < timelineItems.length - 1
                const nextTimelineItem = hasNextTimelineItem
                  ? timelineItems[timelineIndex + 1]
                  : null
                const pickerKey = `after:${timelineItem.id}`

                if (timelineItem.type === 'editorial') {
                  const editorialBlock = editorialBlockById.get(timelineItem.editorialBlockId)
                  if (!editorialBlock) return null
                  const isEditingThisEditorialBlock =
                    activeEditingTimelineItemId === timelineItem.id
                  const anchorBlock = editorialBlock.afterBlockId
                    ? contentBlockById.get(editorialBlock.afterBlockId)
                    : null

                  return (
                    <div
                      key={timelineItem.id}
                      data-timeline-id={timelineItem.id}
                      className={`block-editor-item editorial-block-item ${draggedTimelineItemId === timelineItem.id ? 'dragging' : ''} ${dragOverTimelineItemId === timelineItem.id ? 'drag-over' : ''}`}
                      draggable={canReorder}
                      onDragStart={(e) => handleDragStart(e, timelineItem.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, timelineItem.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, timelineItem.id)}
                    >
                      {renderEditorialBlockCard(
                        editorialBlock,
                        editorialTimelineNumberMap.get(editorialBlock.id) || timelineIndex + 1,
                        {
                          validation: editorialPublishAnalysis.byId[editorialBlock.id],
                          onFixBlock: () => fixEditorialBlock(editorialBlock.id),
                          disableFix: stagedArticle.publishedToPayload,
                          canEdit: isEditingThisEditorialBlock && !stagedArticle.publishedToPayload,
                          onToggleEdit: stagedArticle.publishedToPayload
                            ? undefined
                            : () => toggleTimelineItemEdit(timelineItem.id),
                          onChangeMarkdown: (nextMarkdown) =>
                            updateEditorialBlockMarkdown(editorialBlock.id, nextMarkdown),
                          onRemoveBlock: () => removeEditorialBlock(editorialBlock.id),
                          disableRemove: stagedArticle.publishedToPayload,
                          canReorder,
                          onMoveUp: () => moveTimelineItem(timelineItem.id, 'up'),
                          onMoveDown: () => moveTimelineItem(timelineItem.id, 'down'),
                          disableMoveUp: isFirstTimelineItem,
                          disableMoveDown: isLastTimelineItem,
                        }
                      )}
                      {!stagedArticle.publishedToPayload
                        && hasNextTimelineItem
                        && anchorBlock
                        && renderActionZoneForBlock(anchorBlock, {
                          showFuse: false,
                          pickerKey,
                          placeAfterImage: editorialBlock.placeAfterImage === true,
                        })}
                    </div>
                  )
                }

                if (timelineItem.type === 'image') {
                  const block = contentBlockById.get(timelineItem.contentBlockId)
                  if (!block) return null
                  if (!block.imageAfter && !block.imgPairAfter && !block.imgTrioAfter) return null
                  const imageBlockNumber = imageTimelineNumberMap.get(block.id) || timelineIndex + 1
                  const isEditingThisImageBlock = activeEditingTimelineItemId === timelineItem.id

                  return (
                    <div
                      key={timelineItem.id}
                      data-timeline-id={timelineItem.id}
                      className={`block-editor-item block-image-item ${draggedTimelineItemId === timelineItem.id ? 'dragging' : ''} ${dragOverTimelineItemId === timelineItem.id ? 'drag-over' : ''}`}
                      draggable={canReorder}
                      onDragStart={(e) => handleDragStart(e, timelineItem.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, timelineItem.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, timelineItem.id)}
                    >
                      <div className="block-image-container">
                        <div className="block-card block-image-card">
                          <div className="block-card-header">
                            <div className="block-card-header-left">
                              {canReorder && (
                                <div className="block-drag-handle" title="Drag to reorder">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="9" cy="5" r="1.5"/>
                                    <circle cx="15" cy="5" r="1.5"/>
                                    <circle cx="9" cy="12" r="1.5"/>
                                    <circle cx="15" cy="12" r="1.5"/>
                                    <circle cx="9" cy="19" r="1.5"/>
                                    <circle cx="15" cy="19" r="1.5"/>
                                  </svg>
                                </div>
                              )}
                              <span className="block-number">{imageBlockNumber}</span>
                              <span className="block-type-badge block-type-badge-image">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                  <circle cx="8.5" cy="8.5" r="1.5"/>
                                  <polyline points="21 15 16 10 5 21"/>
                                </svg>
                                {block.imgTrioAfter ? 'Img Trio (3)' : block.imgPairAfter ? 'Img Pair (2)' : 'Image'}
                              </span>
                            </div>
                            <div className="block-card-header-right">
                              {canReorder && (
                                <div className="block-move-buttons">
                                  <button
                                    type="button"
                                    className="block-move-btn"
                                    onClick={() => moveTimelineItem(timelineItem.id, 'up')}
                                    disabled={isFirstTimelineItem}
                                    title="Move up"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 15l-6-6-6 6"/>
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="block-move-btn"
                                    onClick={() => moveTimelineItem(timelineItem.id, 'down')}
                                    disabled={isLastTimelineItem}
                                    title="Move down"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                  </button>
                                </div>
                              )}
                              {!stagedArticle.publishedToPayload && (
                                <button
                                  type="button"
                                  className="block-edit-btn"
                                  onClick={() => toggleTimelineItemEdit(timelineItem.id)}
                                  title={isEditingThisImageBlock ? 'Done editing caption' : 'Edit caption'}
                                >
                                  {isEditingThisImageBlock ? 'Done' : 'Caption'}
                                </button>
                              )}
                              {!stagedArticle.publishedToPayload && (block.imageAfter || block.imgPairAfter || block.imgTrioAfter) && (
                                <button
                                  type="button"
                                  className="block-edit-btn"
                                  onClick={() => {
                                    if (block.imgTrioAfter) {
                                      openBlockImageModal(block.id, 'img-trio', {
                                        caption: block.imgTrioAfter.caption || '',
                                        trioFormat: block.imgTrioAfter.format,
                                        selectedAssetIds: [
                                          block.imgTrioAfter.imageOne,
                                          block.imgTrioAfter.imageTwo,
                                          block.imgTrioAfter.imageThree,
                                        ],
                                        replaceExistingBlock: true,
                                      })
                                      return
                                    }
                                    if (block.imgPairAfter) {
                                      openBlockImageModal(block.id, 'img', {
                                        caption: block.imgPairAfter.caption || '',
                                        selectedAssetIds: [
                                          block.imgPairAfter.imageOne,
                                          block.imgPairAfter.imageTwo,
                                        ],
                                        replaceExistingBlock: true,
                                      })
                                      return
                                    }
                                    if (block.imageAfter) {
                                      openBlockImageModal(block.id, 'default', {
                                        replaceExistingBlock: true,
                                      })
                                    }
                                  }}
                                  title={
                                    block.imgTrioAfter
                                      ? 'Edit img trio'
                                      : block.imgPairAfter
                                        ? 'Edit img pair'
                                        : 'Change image'
                                  }
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 20h9"/>
                                    <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>
                                  </svg>
                                  Edit
                                </button>
                              )}
                              {!stagedArticle.publishedToPayload && (
                                <button
                                  type="button"
                                  className="block-delete-btn"
                                  onClick={() => {
                                    if (block.imgTrioAfter) {
                                      removeImgTrioAfterBlock(block.id)
                                      return
                                    }
                                    if (block.imgPairAfter) {
                                      removeImgPairAfterBlock(block.id)
                                      return
                                    }
                                    removeImageAfterBlock(block.id)
                                  }}
                                  title={block.imgPairAfter || block.imgTrioAfter ? 'Remove img block' : 'Remove image'}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="block-image">
                            {(() => {
                              if (block.imgTrioAfter) {
                                const imageOne = mediaAssets.find((m) => m.id === block.imgTrioAfter?.imageOne)
                                const imageTwo = mediaAssets.find((m) => m.id === block.imgTrioAfter?.imageTwo)
                                const imageThree = mediaAssets.find((m) => m.id === block.imgTrioAfter?.imageThree)

                                if (!imageOne || !imageTwo || !imageThree) {
                                  return <span className="block-image-missing">One or more images not found</span>
                                }

                                return (
                                  <div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                      <img
                                        src={getImageUrl(imageOne)}
                                        alt={getMediaAssetAltText(imageOne) || ''}
                                      />
                                      <img
                                        src={getImageUrl(imageTwo)}
                                        alt={getMediaAssetAltText(imageTwo) || ''}
                                      />
                                      <img
                                        src={getImageUrl(imageThree)}
                                        alt={getMediaAssetAltText(imageThree) || ''}
                                      />
                                    </div>
                                    {isEditingThisImageBlock && !stagedArticle.publishedToPayload ? (
                                      <input
                                        type="text"
                                        className="stage-article-modal-search-input"
                                        style={{ marginTop: '0.5rem' }}
                                        value={block.imgTrioAfter.caption || ''}
                                        onChange={(event) => updateMediaGroupCaption(block.id, event.target.value)}
                                        placeholder="Caption for all images..."
                                      />
                                    ) : block.imgTrioAfter.caption?.trim() ? (
                                      <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.85rem', opacity: 0.8 }}>
                                        {block.imgTrioAfter.caption}
                                      </p>
                                    ) : null}
                                  </div>
                                )
                              }

                              if (block.imgPairAfter) {
                                const imageOne = mediaAssets.find((m) => m.id === block.imgPairAfter?.imageOne)
                                const imageTwo = mediaAssets.find((m) => m.id === block.imgPairAfter?.imageTwo)

                                if (!imageOne || !imageTwo) {
                                  return <span className="block-image-missing">One or more images not found</span>
                                }

                                return (
                                  <div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                      <img
                                        src={getImageUrl(imageOne)}
                                        alt={getMediaAssetAltText(imageOne) || ''}
                                      />
                                      <img
                                        src={getImageUrl(imageTwo)}
                                        alt={getMediaAssetAltText(imageTwo) || ''}
                                      />
                                    </div>
                                    {isEditingThisImageBlock && !stagedArticle.publishedToPayload ? (
                                      <input
                                        type="text"
                                        className="stage-article-modal-search-input"
                                        style={{ marginTop: '0.5rem' }}
                                        value={block.imgPairAfter.caption || ''}
                                        onChange={(event) => updateMediaGroupCaption(block.id, event.target.value)}
                                        placeholder="Caption for both images..."
                                      />
                                    ) : block.imgPairAfter.caption?.trim() ? (
                                      <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.85rem', opacity: 0.8 }}>
                                        {block.imgPairAfter.caption}
                                      </p>
                                    ) : null}
                                  </div>
                                )
                              }

                              const img = mediaAssets.find((m) => m.id === block.imageAfter)
                              if (!img) {
                                return <span className="block-image-missing">Image not found</span>
                              }

                              return (
                                <img src={getImageUrl(img)} alt={getMediaAssetAltText(img) || block.imageAfterAltText || ''} />
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                      {!stagedArticle.publishedToPayload
                        && hasNextTimelineItem
                        && renderActionZoneForBlock(block, {
                          showFuse: false,
                          pickerKey,
                          placeAfterImage: false,
                          allowImageAdd: true,
                        })}
                    </div>
                  )
                }

                const block = contentBlockById.get(timelineItem.contentBlockId)
                if (!block) return null
                const contentIndex = contentBlockIndexMap.get(block.id) ?? 0
                const contentBlockNumber = contentTimelineNumberMap.get(block.id) ?? (contentIndex + 1)
                const isEditingThisContentBlock =
                  activeEditingTimelineItemId === timelineItem.id
                  && !stagedArticle.publishedToPayload

                return (
                  <div
                    key={timelineItem.id}
                    data-timeline-id={timelineItem.id}
                    className={`block-editor-item ${draggedTimelineItemId === timelineItem.id ? 'dragging' : ''} ${dragOverTimelineItemId === timelineItem.id ? 'drag-over' : ''}`}
                    draggable={canReorder}
                    onDragStart={(e) => handleDragStart(e, timelineItem.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, timelineItem.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, timelineItem.id)}
                  >
                    {/* Block Content */}
                    <div className={`block-card ${isEditingThisContentBlock ? 'editing' : ''} ${block.type === 'pullquote' ? 'pullquote' : ''}`}>
                      <div className="block-card-header">
                        <div className="block-card-header-left">
                          {/* Drag Handle */}
                          {canReorder && (
                            <div className="block-drag-handle" title="Drag to reorder">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="9" cy="5" r="1.5"/>
                                <circle cx="15" cy="5" r="1.5"/>
                                <circle cx="9" cy="12" r="1.5"/>
                                <circle cx="15" cy="12" r="1.5"/>
                                <circle cx="9" cy="19" r="1.5"/>
                                <circle cx="15" cy="19" r="1.5"/>
                              </svg>
                            </div>
                          )}
                          <span className="block-number">{contentBlockNumber}</span>
                          {block.type === 'pullquote' && (
                            <span className="block-type-badge">Pull Quote</span>
                          )}
                        </div>
                        <div className="block-card-header-right">
                          {/* Move buttons */}
                          {canReorder && (
                            <div className="block-move-buttons">
                              <button
                                type="button"
                                className="block-move-btn"
                                onClick={() => moveTimelineItem(timelineItem.id, 'up')}
                                disabled={isFirstTimelineItem}
                                title="Move up"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 15l-6-6-6 6"/>
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="block-move-btn"
                                onClick={() => moveTimelineItem(timelineItem.id, 'down')}
                                disabled={isLastTimelineItem}
                                title="Move down"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M6 9l6 6 6-6"/>
                                </svg>
                              </button>
                            </div>
                          )}
                          {!stagedArticle.publishedToPayload && (
                            <button
                              type="button"
                              className="block-edit-btn"
                              onClick={() => toggleTimelineItemEdit(timelineItem.id)}
                              title={isEditingThisContentBlock ? 'Done editing block' : 'Edit block'}
                            >
                              {isEditingThisContentBlock ? 'Done' : 'Edit'}
                            </button>
                          )}
                          {!stagedArticle.publishedToPayload && (
                            <button
                              type="button"
                              className="block-delete-btn"
                              onClick={() => deleteBlock(block.id)}
                              title="Delete block"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditingThisContentBlock ? (
                        <textarea
                          className={`block-textarea ${block.type === 'pullquote' ? 'pullquote' : ''}`}
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          onInput={(event) => resizeTextareaToContent(event.currentTarget)}
                          ref={(element) => {
                            if (element) resizeTextareaToContent(element)
                          }}
                          rows={block.type === 'pullquote' ? 3 : Math.max(4, block.content.split('\n').length + 2)}
                          placeholder={block.type === 'pullquote' ? 'Enter your pull quote...' : ''}
                        />
                      ) : block.type === 'pullquote' ? (
                        <div className="block-pullquote-preview">
                          <svg className="block-pullquote-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
                          </svg>
                          <p>{block.content}</p>
                        </div>
                      ) : (
                        <div className="block-preview">
                          {(() => {
                            const splitPoints = findHeaderSplitPoints(block.content)
                            if (splitPoints.length === 0 || stagedArticle.publishedToPayload) {
                              // No split points, render normally
                              return (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {block.content}
                                </ReactMarkdown>
                              )
                            }

                            // Split content into segments at header boundaries
                            const lines = block.content.split('\n')
                            const segments: { content: string; splitLineIndex: number | null }[] = []
                            let lastIndex = 0

                            for (const point of splitPoints) {
                              segments.push({
                                content: lines.slice(lastIndex, point.lineIndex).join('\n'),
                                splitLineIndex: point.lineIndex, // The line index where we'd split AFTER this segment
                              })
                              lastIndex = point.lineIndex
                            }
                            // Add the last segment (no split after it)
                            segments.push({
                              content: lines.slice(lastIndex).join('\n'),
                              splitLineIndex: null,
                            })

                            return segments.map((segment, i) => (
                              <div key={i}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {segment.content}
                                </ReactMarkdown>
                                {segment.splitLineIndex !== null && (
                                  <div className="block-split-zone">
                                    <button
                                      type="button"
                                      className="block-split-btn"
                                      onClick={() => splitBlockAtHeader(block.id, segment.splitLineIndex!)}
                                      title="Split here"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5"/>
                                      </svg>
                                      Split
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))
                          })()}
                        </div>
                      )}
                    </div>
                    {!stagedArticle.publishedToPayload
                      && hasNextTimelineItem
                      && renderActionZoneForBlock(block, {
                        showFuse: nextTimelineItem?.type === 'content',
                        pickerKey,
                        placeAfterImage: false,
                      })}
                  </div>
                )
              })}

              {/* Action Zone at End (reuse same controls as between blocks) */}
              {!stagedArticle.publishedToPayload && lastContentBlock && (
                <div className="block-action-zone">
                  <div className="block-action-line" />
                  <div className="block-action-buttons">
                    {canAddImageAfterBlock(lastContentBlock) && renderImagePicker(lastContentBlock.id, 'end')}
                    <button
                      type="button"
                      className="block-add-block-btn"
                      onClick={() => addNewBlock(lastContentBlock.id)}
                      title="Add new text block here"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Block
                    </button>
                    {renderEditorialPicker(
                      lastContentBlock.id,
                      'end',
                      false
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="stage-article-sidebar">
          <div className="stage-article-sidebar-inner">
            {/* Publish / Status */}
            <div className="stage-article-sidebar-section stage-article-sidebar-publish">
              {!stagedArticle.publishedToPayload ? (
                <>
                  <button
                    onClick={handlePublish}
                    disabled={isPublishing || !allFieldsFilled}
                    className="stage-article-publish-btn"
                  >
                    {isPublishing ? 'Publishing...' :
                     !allFieldsFilled ? 'Complete fields below' :
                     'Publish to Payload'}
                  </button>
                </>
              ) : (
                <div className="stage-article-published-notice">
                  Published to Payload
                  {stagedArticle.payloadArticleId && (
                    <span> &middot; ID {stagedArticle.payloadArticleId}</span>
                  )}
                </div>
              )}

              {publishResult && (
                <div className={`stage-article-result ${publishResult.success ? 'success' : 'error'}`}>
                  {publishResult.message}
                </div>
              )}
            </div>

            {/* Featured Image */}
            <div className="stage-article-sidebar-section">
              <label className="stage-article-label">
                Featured Image <span className="required">*</span>
              </label>

              {selectedFeaturedImage ? (
                <div className="stage-article-featured-image">
                  <img
                    src={getImageUrl(selectedFeaturedImage)}
                    alt={getMediaAssetAltText(selectedFeaturedImage) || selectedFeaturedImage.filename}
                  />
                  {!stagedArticle.publishedToPayload && (
                    <button
                      type="button"
                      onClick={() => setShowImageModal(true)}
                      className="stage-article-change-btn"
                    >
                      Change
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowImageModal(true)}
                  className="stage-article-image-placeholder"
                  disabled={stagedArticle.publishedToPayload}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>Select image</span>
                </button>
              )}
            </div>

            {/* Location */}
            <div className="stage-article-sidebar-section">
              <label className="stage-article-label">
                Location <span className="required">*</span>
              </label>
              <select
                value={stagedArticle.locationId || ''}
                onChange={(e) => updateStagedArticle({ locationId: Number(e.target.value) || undefined })}
                className="stage-article-select"
                disabled={stagedArticle.publishedToPayload}
              >
                <option value="">-- Select --</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {getLocationDisplayName(loc)} ({loc.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Info */}
            <div className="stage-article-sidebar-section stage-article-info-box">
              <p><strong>Run ID:</strong> {stagedArticle.runId}</p>
              <p><strong>Created:</strong> {new Date(stagedArticle.createdAt).toLocaleDateString()}</p>
              <p><strong>Updated:</strong> {new Date(stagedArticle.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>
        </aside>
      </div>

      {/* Featured Image Selection Modal */}
      {showImageModal && !stagedArticle.publishedToPayload && (
        <div className="stage-article-modal-overlay" onClick={() => setShowImageModal(false)}>
          <div className="stage-article-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stage-article-modal-header">
              <h3>{showUploadModal ? 'Upload New Image' : 'Select Featured Image'}</h3>
              <button
                type="button"
                className="stage-article-modal-close"
                onClick={() => {
                  if (showUploadModal) {
                    setShowUploadModal(false)
                  } else {
                    setShowImageModal(false)
                  }
                }}
              >
                ×
              </button>
            </div>

            {!showUploadModal ? (
              <>
                <div className="stage-article-modal-actions">
                  <button
                    type="button"
                    className="stage-article-modal-upload-btn"
                    disabled={!hasValidUploadLocation}
                    onClick={() => {
                      if (!hasValidUploadLocation) return
                      setImageAltText('')
                      setImagePhotographerCredit('')
                      setShowUploadModal(true)
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload New Image
                  </button>
                </div>
                {!hasValidUploadLocation && (
                  <div className="stage-article-modal-empty" style={{ marginBottom: '0.75rem' }}>
                    <p>{uploadLocationRequirementMessage}</p>
                  </div>
                )}

                <div className="stage-article-modal-search">
                  <input
                    type="text"
                    placeholder="Search images..."
                    value={imageSearch}
                    onChange={(e) => setImageSearch(e.target.value)}
                    className="stage-article-modal-search-input"
                  />
                </div>

                <div className="stage-article-modal-grid">
                  {filteredFeaturedImageAssets
                    .map(img => (
                      <button
                        key={img.id}
                        type="button"
                        className={`stage-article-modal-image ${selectedFeaturedImage?.id === img.id ? 'selected' : ''}`}
                        onClick={() => {
                          const preferredAsset = findPreferredVariantAsset(
                            img.id,
                            FEATURED_IMAGE_VARIANT
                          )
                          if (!preferredAsset) return
                          updateStagedArticle({ featuredImageId: preferredAsset.id })
                          setShowImageModal(false)
                        }}
                      >
                        <img
                          src={getImageUrl(img)}
                          alt={getMediaAssetAltText(img) || img.filename}
                          loading="lazy"
                        />
                        <span className="stage-article-modal-image-name">{img.filename}</span>
                        {selectedFeaturedImage?.id === img.id && (
                          <div className="stage-article-modal-selected-badge">✓</div>
                        )}
                      </button>
                    ))}
                </div>

                {filteredFeaturedImageAssets.length === 0 && (
                  <div className="stage-article-modal-empty">
                    <p>
                      No editorial ({FEATURED_IMAGE_WIDTH}x{FEATURED_IMAGE_HEIGHT}) images
                      match the current search.
                    </p>
                  </div>
                )}

                <div className="stage-article-modal-footer">
                  <button
                    type="button"
                    className="stage-article-modal-done"
                    onClick={() => setShowImageModal(false)}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="stage-article-upload-section">
                  {selectedLocation ? (
                    <ImageUpload
                      externalRef={stagedArticle.id}
                      fileNamePrefix={featuredImageFileNamePrefix}
                      locationRef={selectedLocation.id}
                      token={token || ''}
                      altText={imageAltText}
                      photographerCredit={imagePhotographerCredit}
                      onUploadComplete={handleUploadComplete}
                      onAltTextGenerated={(text) => setImageAltText(text)}
                      onPhotographerCreditChange={(text) => setImagePhotographerCredit(text)}
                      onCancel={() => setShowUploadModal(false)}
                    />
                  ) : (
                    <div className="stage-article-modal-empty">
                      <p>{uploadLocationRequirementMessage}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Block Image Selection Modal */}
      {blockImageModal?.show && !stagedArticle.publishedToPayload && (
        <div className="stage-article-modal-overlay" onClick={closeBlockImageModal}>
          <div className="stage-article-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stage-article-modal-header">
              <h3>
                {showBlockUploadModal
                  ? 'Upload New Image'
                  : isImgBlockModal
                    ? 'Add Img Pair Between Blocks'
                    : isImgTrioModal
                      ? 'Add Img Trio Between Blocks'
                    : 'Add Image Between Blocks'}
              </h3>
              <button
                type="button"
                className="stage-article-modal-close"
                onClick={() => {
                  if (showBlockUploadModal) {
                    setShowBlockUploadModal(false)
                  } else {
                    closeBlockImageModal()
                  }
                }}
              >
                ×
              </button>
            </div>

            {!showBlockUploadModal ? (
              <>
                {!isMultiImageModal && (
                  <div className="stage-article-modal-actions">
                    <button
                      type="button"
                      className="stage-article-modal-upload-btn"
                      disabled={!hasValidUploadLocation}
                      onClick={() => {
                        if (!hasValidUploadLocation) return
                        setBlockImageAltText('')
                        setBlockImagePhotographerCredit('')
                        setShowBlockUploadModal(true)
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      Upload New Image
                    </button>
                  </div>
                )}
                {!isMultiImageModal && !hasValidUploadLocation && (
                  <div className="stage-article-modal-empty" style={{ marginBottom: '0.75rem' }}>
                    <p>{uploadLocationRequirementMessage}</p>
                  </div>
                )}

                {isImgBlockModal && (
                  <p style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.82rem', color: '#6b6b6b' }}>
                    Select exactly {IMG_PAIR_REQUIRED_IMAGE_COUNT} images. Showing only {IMG_BLOCK_MIN_WIDTH}x{IMG_BLOCK_MIN_HEIGHT} assets; saved block is locked to that exact size.
                  </p>
                )}

                {isImgTrioModal && (
                  <p style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.82rem', color: '#6b6b6b' }}>
                    Select exactly {IMG_TRIO_REQUIRED_IMAGE_COUNT} images. Showing only {imgTrioDimensions.width}x{imgTrioDimensions.height} assets for the selected format.
                  </p>
                )}

                {isImgTrioModal && (
                  <div className="stage-article-modal-search" style={{ marginBottom: '0.5rem' }}>
                    <select
                      className="stage-article-select"
                      value={imgTrioFormat}
                      onChange={(e) => setImgTrioFormat(e.target.value as ImgTrioFormat)}
                    >
                      <option value="square">Square (1080x1080)</option>
                      <option value="landscape">Landscape (1920x1080)</option>
                    </select>
                  </div>
                )}

                {isMultiImageModal && (
                  <div className="stage-article-modal-search" style={{ marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder={isImgTrioModal ? 'Caption for all three images (optional)' : 'Caption for both images (optional)'}
                      value={imgBlockCaption}
                      onChange={(e) => setImgBlockCaption(e.target.value)}
                      className="stage-article-modal-search-input"
                    />
                  </div>
                )}

                <div className="stage-article-modal-search">
                  <input
                    type="text"
                    placeholder="Search images..."
                    value={blockImageSearch}
                    onChange={(e) => setBlockImageSearch(e.target.value)}
                    className="stage-article-modal-search-input"
                  />
                </div>

                {isMultiImageModal && isLoadingImgBlockAssets && (
                  <div className="stage-article-modal-empty">
                    <p>Loading filtered image assets...</p>
                  </div>
                )}

                {isMultiImageModal && imgBlockAssetsError && (
                  <div className="stage-article-modal-empty">
                    <p>{imgBlockAssetsError}</p>
                  </div>
                )}

                <div className="stage-article-modal-grid">
                  {filteredBlockImageAssets
                    .map(img => (
                      <button
                        key={img.id}
                        type="button"
                        className={`stage-article-modal-image ${isMultiImageModal && selectedImgBlockAssetIds.includes(img.id) ? 'selected' : ''}`}
                        onClick={() => {
                          if (isMultiImageModal) {
                            toggleImgBlockAssetSelection(img.id, requiredImageCount)
                            return
                          }

                          const preferredAsset = findPreferredVariantAsset(img.id, CONTENT_BLOCK_VARIANT)
                          if (!preferredAsset) return
                          addImageAfterBlock(
                            blockImageModal.blockId,
                            preferredAsset.id,
                            getMediaAssetAltText(preferredAsset),
                            blockImageModal.replaceExistingBlock === true
                          )
                          mergeMediaAssetsIntoState([preferredAsset])
                          closeBlockImageModal()
                        }}
                      >
                        <img
                          src={getImageUrl(img)}
                          alt={getMediaAssetAltText(img) || img.filename}
                          loading="lazy"
                        />
                        <span className="stage-article-modal-image-name">{img.filename}</span>
                        {isMultiImageModal && selectedImgBlockAssetIds.includes(img.id) && (
                          <div className="stage-article-modal-selected-badge">
                            {selectedImgBlockAssetIds.indexOf(img.id) + 1}
                          </div>
                        )}
                      </button>
                    ))}
                </div>

                {!isLoadingImgBlockAssets && !imgBlockAssetsError && filteredBlockImageAssets.length === 0 && (
                  <div className="stage-article-modal-empty">
                    <p>
                      {isImgBlockModal
                        ? `No ${IMG_BLOCK_MIN_WIDTH}x${IMG_BLOCK_MIN_HEIGHT} images match the current search.`
                        : isImgTrioModal
                          ? `No ${imgTrioDimensions.width}x${imgTrioDimensions.height} images match the current search.`
                        : `No ${CONTENT_BLOCK_VARIANT} (${CONTENT_BLOCK_WIDTH}x${CONTENT_BLOCK_HEIGHT}) images match the current search.`}
                    </p>
                  </div>
                )}

                <div className="stage-article-modal-footer">
                  {isMultiImageModal && (
                    <button
                      type="button"
                      className="stage-article-modal-done"
                      onClick={handleAddSelectedImgBlock}
                      disabled={selectedImgBlockAssets.length !== requiredImageCount}
                    >
                      {isImgTrioModal ? 'Add Img Trio' : 'Add Img Pair'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="stage-article-modal-done"
                    onClick={closeBlockImageModal}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="stage-article-upload-section">
                  {selectedLocation ? (
                    <ImageUpload
                      externalRef={blockImageExternalRef}
                      fileNamePrefix={blockImageFileNamePrefix}
                      locationRef={selectedLocation.id}
                      token={token || ''}
                      altText={blockImageAltText}
                      photographerCredit={blockImagePhotographerCredit}
                      onUploadComplete={handleBlockImageUploadComplete}
                      onAltTextGenerated={(text) => setBlockImageAltText(text)}
                      onPhotographerCreditChange={(text) => setBlockImagePhotographerCredit(text)}
                      onCancel={() => setShowBlockUploadModal(false)}
                    />
                  ) : (
                    <div className="stage-article-modal-empty">
                      <p>{uploadLocationRequirementMessage}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
