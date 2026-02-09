import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../../../providers/AuthProvider'
import { ImageUpload, type UploadImageResponse } from '../../../features/images'
import {
  fetchLocations,
  fetchMediaAssets,
  createArticle,
  convertMarkdownToLexical,
  fetchResult,
  markArticleSynced,
  type CreateArticlePayload,
  type Location,
  type MediaAsset,
} from '../api'
import '../../youtube2blog/styles/stage-article.css'

// Block type for parsed markdown sections
export type ContentBlock = {
  id: string
  type: 'text' | 'pullquote'
  content: string // Markdown content (header + body) or pull quote text
  imageAfter?: number // Media asset ID for image between this and next block
  imageAfterAltText?: string
}

export type EditorialBlock = {
  id: string
  component: string
  label: string
  markdown: string
  anchorLine?: number
  afterBlockId?: string | null
}

type MediaVariant = 'thumbnail' | 'square' | 'wide' | 'portrait' | 'hero'

const CONTENT_BLOCK_VARIANT: MediaVariant = 'wide'
const FEATURED_IMAGE_VARIANT: MediaVariant = 'hero'

const VARIANT_FALLBACK_ORDER: MediaVariant[] = [
  'wide',
  'hero',
  'square',
  'portrait',
  'thumbnail',
]

// Staged Article Type
export type StagedArticle = {
  id: string
  runId: string
  originalTitle: string
  originalContent: string
  originalType: string
  // Editable fields
  title: string
  content: string
  blocks: ContentBlock[]
  editorialBlocks: EditorialBlock[]
  // Payload fields
  locationId?: number
  featuredImageId?: number
  // Status
  lexicalConverted: boolean
  lexicalData?: object
  publishedToPayload: boolean
  payloadArticleId?: number
  createdAt: string
  updatedAt: string
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
    }))
    .filter((block) => block.markdown.trim().length > 0)
}

const KEY_TAKEAWAYS_COMPONENT = 'key_takeaways_box'
const KEY_TAKEAWAYS_LABEL = 'Key Takeaways'
const PULL_QUOTE_COMPONENT = 'pull_quote'
const PULL_QUOTE_LABEL = 'Pull Quote'

type PayloadContentBlock = NonNullable<CreateArticlePayload['contentBlocks']>[number]
type SupportedPayloadBlockType = 'key-takeaway' | 'pull-quote'

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
      type: 'editorial'
      editorialBlockId: string
    }

function getContentTimelineItemId(blockId: string): string {
  return `content:${blockId}`
}

function getEditorialTimelineItemId(editorialBlockId: string): string {
  return `editorial:${editorialBlockId}`
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

function buildCanonicalKeyTakeawaysMarkdown(label: string, rawItems: string[]): string {
  const normalizedLabel = label.trim() || KEY_TAKEAWAYS_LABEL
  const normalizedItems = rawItems
    .map((item) =>
      item
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
    )
    .filter(Boolean)

  const items = normalizedItems.length > 0
    ? normalizedItems.slice(0, 5)
    : ['Add takeaway 1', 'Add takeaway 2', 'Add takeaway 3']

  return [
    `> [!EDITORIAL-BLOCK-START|${KEY_TAKEAWAYS_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${KEY_TAKEAWAYS_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    ...items.map((item) => `> - ${item}`),
    `> [!EDITORIAL-BLOCK-END|${KEY_TAKEAWAYS_COMPONENT}]`,
  ].join('\n')
}

function buildCanonicalPullQuoteMarkdown(label: string, rawQuote: string): string {
  const normalizedLabel = label.trim() || PULL_QUOTE_LABEL
  const quote = rawQuote.trim() || 'Add pull quote before publishing.'

  return [
    `> [!EDITORIAL-BLOCK-START|${PULL_QUOTE_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${PULL_QUOTE_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    `> "${quote}"`,
    `> [!EDITORIAL-BLOCK-END|${PULL_QUOTE_COMPONENT}]`,
  ].join('\n')
}

function parseKeyTakeawayEditorialBlock(block: EditorialBlock): {
  label: string
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
  const items = frame.bodyLines
    .filter((line) => listItemRegex.test(line))
    .map((line) =>
      line
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
    )
    .filter(Boolean)

  const label = frame.label || KEY_TAKEAWAYS_LABEL
  const correctedMarkdown = buildCanonicalKeyTakeawaysMarkdown(label, items)

  return {
    label,
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

async function fetchEditorialBlocksFromRun(runId: string): Promise<EditorialBlock[]> {
  if (!runId) return []

  try {
    const result = await fetchResult(runId)
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

  if (!blocks.length || !ranges.length) {
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

    if (afterIndex >= blocks.length) {
      afterIndex = blocks.length - 1
    }

    return {
      ...block,
      afterBlockId: afterIndex >= 0 ? blocks[afterIndex].id : null,
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
    items.push({
      id: getContentTimelineItemId(block.id),
      type: 'content',
      contentBlockId: block.id,
    })

    const anchoredEditorialBlocks = editorialByBlockId.get(block.id) || []
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
  const contentById = new Map(blocks.map((block) => [block.id, block]))
  const normalizedEditorialBlocks = normalizeEditorialBlocks(editorialBlocks)
  const editorialById = new Map(
    normalizedEditorialBlocks.map((editorialBlock) => [editorialBlock.id, editorialBlock])
  )

  const nextBlocks: ContentBlock[] = []
  const nextEditorialBlocks: EditorialBlock[] = []
  const seenContentIds = new Set<string>()
  const seenEditorialIds = new Set<string>()
  let lastContentBlockId: string | null = null

  timelineItems.forEach((item) => {
    if (item.type === 'content') {
      const block = contentById.get(item.contentBlockId)
      if (!block || seenContentIds.has(block.id)) return
      nextBlocks.push(block)
      seenContentIds.add(block.id)
      lastContentBlockId = block.id
      return
    }

    const editorialBlock = editorialById.get(item.editorialBlockId)
    if (!editorialBlock || seenEditorialIds.has(editorialBlock.id)) return
    nextEditorialBlocks.push({
      ...editorialBlock,
      afterBlockId: lastContentBlockId,
    })
    seenEditorialIds.add(editorialBlock.id)
  })

  // Keep any missing blocks/items as a fallback so data is never dropped.
  blocks.forEach((block) => {
    if (seenContentIds.has(block.id)) return
    nextBlocks.push(block)
    seenContentIds.add(block.id)
    lastContentBlockId = block.id
  })

  normalizedEditorialBlocks.forEach((editorialBlock) => {
    if (seenEditorialIds.has(editorialBlock.id)) return
    nextEditorialBlocks.push({
      ...editorialBlock,
      afterBlockId: lastContentBlockId,
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

function renderEditorialBlockCard(
  block: EditorialBlock,
  displayNumber: number,
  options?: {
    validation?: EditorialPublishValidation
    onFixBlock?: () => void
    disableFix?: boolean
    canEdit?: boolean
    onChangeMarkdown?: (nextMarkdown: string) => void
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
  return (
    <article
      key={block.id}
      style={{
        border: '1px solid rgba(0, 0, 0, 0.12)',
        borderRadius: '12px',
        padding: '0.85rem',
        background: '#f7f5f2',
        marginTop: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
          gap: '0.75rem',
        }}
      >
        <div>
          <strong>{block.label}</strong>
          <div style={{ fontSize: '0.8rem', opacity: 0.65 }}>
            {block.component}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
            Editorial Block Detected #{displayNumber}
          </span>
          {options?.canReorder && (
            <div className="block-move-buttons" style={{ opacity: 1 }}>
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
        </div>
      </div>

      {validation?.status === 'supported' && (
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

      {validation?.status === 'unsupported' && (
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

      {validation?.status === 'invalid' && (
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

      {options?.canEdit && options?.onChangeMarkdown ? (
        <div style={{ marginTop: '0.35rem' }}>
          <textarea
            value={block.markdown}
            onChange={(event) => options.onChangeMarkdown?.(event.target.value)}
            rows={Math.max(8, block.markdown.split('\n').length + 1)}
            className="block-textarea"
            style={{ width: '100%' }}
          />
          <p style={{ marginTop: '0.35rem', fontSize: '0.76rem', opacity: 0.72 }}>
            Key Takeaways needs bullets (`- item`). Pull Quote needs one quote sentence.
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

      <details style={{ marginTop: '0.5rem' }}>
        <summary>Raw Markdown</summary>
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
    </article>
  )
}

function normalizeBlocks(blocks: ContentBlock[] | undefined, fallbackContent: string): ContentBlock[] {
  if (!blocks || blocks.length === 0) {
    return parseMarkdownToBlocks(fallbackContent)
  }

  // Phase 1 contract only publishes text/image blocks.
  return blocks.map((block, index) => ({
    id: block.id || `block_${index}`,
    type: 'text',
    content: block.content || '',
    imageAfter: block.imageAfter,
    imageAfterAltText: block.imageAfterAltText,
  }))
}

function getMediaAssetAltText(img?: MediaAsset | null): string {
  if (!img) return ''
  return img.alt_text?.trim() || img.alt?.trim() || img.altText?.trim() || ''
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

export default function StageArticlePage() {
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
  const [isEditing, setIsEditing] = useState(false)

  // Form state
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null)

  // Modal state for featured image
  const [showImageModal, setShowImageModal] = useState(false)
  const [imageSearch, setImageSearch] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [imageAltText, setImageAltText] = useState('')
  const [imageNarrativeFocus, setImageNarrativeFocus] = useState('')

  // Modal state for block images
  const [blockImageModal, setBlockImageModal] = useState<{ blockId: string; show: boolean } | null>(null)
  const [blockImageSearch, setBlockImageSearch] = useState('')
  const [showBlockUploadModal, setShowBlockUploadModal] = useState(false)
  const [blockImageAltText, setBlockImageAltText] = useState('')
  const [blockImageNarrativeFocus, setBlockImageNarrativeFocus] = useState('')

  // Drag and drop state
  const [draggedTimelineItemId, setDraggedTimelineItemId] = useState<string | null>(null)
  const [dragOverTimelineItemId, setDragOverTimelineItemId] = useState<string | null>(null)

  // Conversion state
  const [isConverting, setIsConverting] = useState(false)

  // Storage key
  const STORAGE_KEY = 'url2blog_staged_articles'

  // Load or create staged article
  useEffect(() => {
    if (!urlRunId && !stagedId) return

    let isCancelled = false

    const loadStagedArticle = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
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
            const normalizedBlocks =
              existing.blocks?.length
                ? normalizeBlocks(existing.blocks, contentForParsing)
                : parsedDetails.blocks
            const existingEditorialBlocks = normalizeEditorialBlocks(existing.editorialBlocks)
            const hasMeaningfulExistingPlacement = hasMeaningfulEditorialPlacement(
              existingEditorialBlocks,
              normalizedBlocks
            )
            let fallbackEditorialBlocks = extractedFromContent.editorialBlocks

            if (!hasMeaningfulExistingPlacement && existing.runId) {
              const runEditorialBlocks = await fetchEditorialBlocksFromRun(existing.runId)
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
              localStorage.setItem(STORAGE_KEY, JSON.stringify(allStaged))
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
            const normalizedBlocks =
              existing.blocks?.length
                ? normalizeBlocks(existing.blocks, contentForParsing)
                : parsedDetails.blocks
            const existingEditorialBlocks = normalizeEditorialBlocks(existing.editorialBlocks)
            const hasMeaningfulExistingPlacement = hasMeaningfulEditorialPlacement(
              existingEditorialBlocks,
              normalizedBlocks
            )
            let fallbackEditorialBlocks = extractedFromContent.editorialBlocks

            if (!hasMeaningfulExistingPlacement && existing.runId) {
              const runEditorialBlocks = await fetchEditorialBlocksFromRun(existing.runId)
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
              localStorage.setItem(STORAGE_KEY, JSON.stringify(allStaged))
            }

            navigate(`/url2blog/stage-article?stagedId=${existing.id}`, { replace: true })
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

            if (!isCancelled) {
              setStagedArticle(newStaged)
            }
            navigate(`/url2blog/stage-article?stagedId=${newStaged.id}`, { replace: true })
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
  }, [urlRunId, stagedId, urlTitle, urlContent, urlType, navigate])

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
  }, [token])

  const updateStagedArticle = useCallback((updates: Partial<StagedArticle>) => {
    setStagedArticle(prev => {
      if (!prev) return null
      const updated = { ...prev, ...updates, updatedAt: new Date().toISOString() }

      updated.content = composeArticleMarkdown(
        updated.blocks || [],
        updated.editorialBlocks || []
      )

      // Update in localStorage
      const stored = localStorage.getItem(STORAGE_KEY)
      const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []
      const index = allStaged.findIndex(s => s.id === updated.id)
      if (index >= 0) {
        allStaged[index] = updated
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allStaged))
      }

      return updated
    })
  }, [])

  const editorialPublishAnalysis = useMemo(
    () => buildEditorialPublishAnalysis(stagedArticle?.editorialBlocks || []),
    [stagedArticle?.editorialBlocks]
  )

  const timelineItems = useMemo(
    () => buildTimelineItems(stagedArticle?.blocks || [], stagedArticle?.editorialBlocks || []),
    [stagedArticle?.blocks, stagedArticle?.editorialBlocks]
  )

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

  // Block operations
  const updateBlockContent = useCallback((blockId: string, newContent: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId ? { ...b, content: newContent } : b
    )
    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const addImageAfterBlock = useCallback((blockId: string, imageId: number, imageAfterAltText?: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId
        ? {
            ...b,
            imageAfter: imageId,
            imageAfterAltText: imageAfterAltText?.trim() || undefined,
          }
        : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const removeImageAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId ? { ...b, imageAfter: undefined, imageAfterAltText: undefined } : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const mergeWithNextBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex(b => b.id === blockId)
    if (blockIndex === -1 || blockIndex >= stagedArticle.blocks.length - 1) return

    const currentBlock = stagedArticle.blocks[blockIndex]
    const nextBlock = stagedArticle.blocks[blockIndex + 1]

    // Warn if there's an image between the blocks that will be deleted
    if (currentBlock.imageAfter) {
      if (!confirm('This will delete the image between these blocks. Continue?')) {
        return
      }
    }

    // Merge content, removing any image that was between them
    const mergedBlock: ContentBlock = {
      id: currentBlock.id,
      type: 'text',
      content: `${currentBlock.content}\n\n${nextBlock.content}`,
      imageAfter: nextBlock.imageAfter, // Keep only the image after the second block
      imageAfterAltText: nextBlock.imageAfterAltText,
    }

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      mergedBlock,
      ...stagedArticle.blocks.slice(blockIndex + 2),
    ]

    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
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
    const lines = block.content.split('\n')

    // Split content at the header line
    const beforeContent = lines.slice(0, lineIndex).join('\n').trim()
    const afterContent = lines.slice(lineIndex).join('\n').trim()

    if (!beforeContent || !afterContent) return

    const newBlocks: ContentBlock[] = [
      { id: block.id, type: 'text', content: beforeContent },
      {
        id: `block_${Date.now()}`,
        type: 'text',
        content: afterContent,
        imageAfter: block.imageAfter,
        imageAfterAltText: block.imageAfterAltText,
      },
    ]

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      ...newBlocks,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]

    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
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
    setIsEditing(true) // Enter edit mode so they can edit the new block
  }, [stagedArticle, updateStagedArticle])

  const deleteBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    if (stagedArticle.blocks.length <= 1) {
      alert('Cannot delete the last block.')
      return
    }

    const block = stagedArticle.blocks.find(b => b.id === blockId)
    if (!block) return

    const hasImage = block.imageAfter
    const message = hasImage
      ? 'Delete this block and its image?'
      : 'Delete this block?'

    if (!confirm(message)) return

    const updatedBlocks = stagedArticle.blocks.filter(b => b.id !== blockId)
    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

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

  const handleSaveEdits = () => {
    setIsEditing(false)
  }

  const handlePublish = async () => {
    if (!token || !stagedArticle) return

    const trimmedTitle = stagedArticle.title.trim()
    const location = locations.find(l => l.id === stagedArticle.locationId)
    const featuredImage = mediaAssets.find(m => m.id === stagedArticle.featuredImageId)

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

    if (editorialPublishAnalysis.hasBlockingBlocks) {
      const details = editorialPublishAnalysis.blockingBlocks
        .slice(0, 3)
        .map((issue) => issue.message)
        .join('; ')
      setPublishResult({
        success: false,
        message: details
          ? `Publishing blocked: ${details}`
          : 'Publishing blocked: block markdown incorrect',
      })
      return
    }

    setIsPublishing(true)
    setPublishResult(null)
    setIsConverting(true)

    try {
      const contentBlockIds = new Set(stagedArticle.blocks.map((block) => block.id))
      const editorialBeforeFirst: PayloadContentBlock[] = []
      const editorialAfterByBlockId = new Map<string, PayloadContentBlock[]>()

      stagedArticle.editorialBlocks.forEach((editorialBlock) => {
        const validation = editorialPublishAnalysis.byId[editorialBlock.id]
        if (!validation || validation.status !== 'supported') return

        if (
          !editorialBlock.afterBlockId
          || !contentBlockIds.has(editorialBlock.afterBlockId)
        ) {
          editorialBeforeFirst.push(validation.payloadBlock)
          return
        }

        const list = editorialAfterByBlockId.get(editorialBlock.afterBlockId) || []
        list.push(validation.payloadBlock)
        editorialAfterByBlockId.set(editorialBlock.afterBlockId, list)
      })

      // Build content blocks array for Payload
      const contentBlocks: PayloadContentBlock[] = [...editorialBeforeFirst]

      let textBlocksAdded = 0

      // Convert each markdown block to Lexical and interleave with images.
      for (const [index, block] of stagedArticle.blocks.entries()) {
        const markdown = block.content.trim()
        if (markdown) {
          const lexicalResult = await convertMarkdownToLexical(markdown)
          if (!lexicalResult.success || !lexicalResult.data) {
            throw new Error(
              lexicalResult.error || `Failed to convert block ${index + 1} to Lexical`
            )
          }

          contentBlocks.push({
            blockType: 'text',
            content: lexicalResult.data,
          })
          textBlocksAdded++
        }

        // Add image block if one exists after this block
        if (block.imageAfter) {
          const imageAsset = mediaAssets.find(m => m.id === block.imageAfter)
          const altText = (block.imageAfterAltText?.trim() || getMediaAssetAltText(imageAsset)).trim()
          if (!altText) {
            throw new Error(`Image after block ${index + 1} is missing alt text`)
          }

          contentBlocks.push({
            blockType: 'image',
            image: block.imageAfter,
            altText,
          })
        }

        const anchoredEditorialBlocks = editorialAfterByBlockId.get(block.id) || []
        anchoredEditorialBlocks.forEach((editorialPayloadBlock) => {
          contentBlocks.push(editorialPayloadBlock)
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

    const stored = localStorage.getItem(STORAGE_KEY)
    const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []
    const updated = allStaged.filter(s => s.id !== stagedArticle.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    navigate('/url2blog/stage')
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
        .then(res => setMediaAssets(res.docs || []))
    }

    setShowUploadModal(false)
    setShowImageModal(false)
    setImageAltText('')
    setImageNarrativeFocus('')
  }

  const handleBlockImageUploadComplete = (result: UploadImageResponse) => {
    if (!blockImageModal) return

    const blockAssetId = pickVariantAssetId(result.variantAssetIds, CONTENT_BLOCK_VARIANT)
    if (blockAssetId) {
      addImageAfterBlock(blockImageModal.blockId, blockAssetId, blockImageAltText)
    }

    if (token) {
      fetchMediaAssets(token, { limit: 50, mimeType: 'image/' })
        .then(res => setMediaAssets(res.docs || []))
    }

    setShowBlockUploadModal(false)
    setBlockImageModal(null)
    setBlockImageAltText('')
    setBlockImageNarrativeFocus('')
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
          <Link to="/url2blog/articles" className="stage-article-btn">Back to Articles</Link>
        </div>
      </div>
    )
  }

  const selectedLocation = locations.find(l => l.id === stagedArticle.locationId)
  const selectedFeaturedImage = mediaAssets.find(m => m.id === stagedArticle.featuredImageId)
  const contentBlockById = new Map(stagedArticle.blocks.map((block) => [block.id, block]))
  const editorialBlockById = new Map(stagedArticle.editorialBlocks.map((block) => [block.id, block]))
  const contentBlockIndexMap = new Map(stagedArticle.blocks.map((block, index) => [block.id, index]))
  const timelineIndexMap = new Map(timelineItems.map((item, index) => [item.id, index]))
  const editorialDisplayOrderMap = new Map<string, number>()
  stagedArticle.editorialBlocks.forEach((block, index) => {
    editorialDisplayOrderMap.set(block.id, index + 1)
  })
  const hasTitle = Boolean(stagedArticle.title.trim())
  const hasBlockingEditorialBlocks = editorialPublishAnalysis.hasBlockingBlocks
  const allFieldsFilled = Boolean(
    selectedLocation
    && selectedFeaturedImage
    && hasTitle
    && !hasBlockingEditorialBlocks
  )
  const missingRequiredFields = [
    ...(!hasTitle ? ['title'] : []),
    ...(!selectedLocation ? ['location'] : []),
    ...(!selectedFeaturedImage ? ['featured image'] : []),
    ...(hasBlockingEditorialBlocks ? ['editorial blocks (block markdown incorrect or unsupported component)'] : []),
  ]

  return (
    <div className="stage-article-page">
      {/* Header */}
      <header className="stage-article-header">
        <div className="stage-article-header-left">
          <Link to="/url2blog/stage" className="stage-article-back-link">
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
            <span className="stage-article-block-count">
              {stagedArticle.blocks.length} blocks
            </span>
            {stagedArticle.editorialBlocks.length > 0 && (
              <span className="stage-article-badge error">
                Editorial blocks: {stagedArticle.editorialBlocks.length}
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
              className="stage-article-icon-btn"
              onClick={() => isEditing ? handleSaveEdits() : setIsEditing(true)}
              title={isEditing ? 'Save changes' : 'Edit blocks'}
            >
              {isEditing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              )}
              {isEditing ? 'Done' : 'Edit'}
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
        {isEditing ? (
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
                  {isEditing ? 'Edit blocks or merge adjacent sections' : 'Fuse blocks or add images between them'}
                </span>
              </label>
              {!stagedArticle.publishedToPayload && (
                <button
                  type="button"
                  className="block-reset-btn"
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
            </div>

            {stagedArticle.editorialBlocks.length > 0 && (
              <div className="stage-article-info-box" style={{ marginBottom: '1rem' }}>
                <p>
                  <strong>Editorial blocks in this draft:</strong>{' '}
                  {stagedArticle.editorialBlocks.length}
                </p>
                <p>
                  `key_takeaways_box` and `pull_quote` can publish to Payload
                  (`key-takeaway` / `pull-quote`). Other components or incorrect
                  block markdown remain locked.
                </p>
                {editorialPublishAnalysis.hasBlockingBlocks && (
                  <p style={{ marginTop: '0.45rem' }}>
                    <strong>Blocking:</strong>{' '}
                    {editorialPublishAnalysis.blockingBlocks
                      .slice(0, 2)
                      .map((issue) => issue.message)
                      .join(' | ')}
                  </p>
                )}
              </div>
            )}

            <div className="block-editor">
              {timelineItems.map((timelineItem) => {
                const timelineIndex = timelineIndexMap.get(timelineItem.id) ?? 0
                const canReorder = !stagedArticle.publishedToPayload && !isEditing
                const isFirstTimelineItem = timelineIndex === 0
                const isLastTimelineItem = timelineIndex === timelineItems.length - 1

                if (timelineItem.type === 'editorial') {
                  const editorialBlock = editorialBlockById.get(timelineItem.editorialBlockId)
                  if (!editorialBlock) return null

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
                        editorialDisplayOrderMap.get(editorialBlock.id) || 1,
                        {
                          validation: editorialPublishAnalysis.byId[editorialBlock.id],
                          onFixBlock: () => fixEditorialBlock(editorialBlock.id),
                          disableFix: stagedArticle.publishedToPayload,
                          canEdit: isEditing && !stagedArticle.publishedToPayload,
                          onChangeMarkdown: (nextMarkdown) =>
                            updateEditorialBlockMarkdown(editorialBlock.id, nextMarkdown),
                          canReorder,
                          onMoveUp: () => moveTimelineItem(timelineItem.id, 'up'),
                          onMoveDown: () => moveTimelineItem(timelineItem.id, 'down'),
                          disableMoveUp: isFirstTimelineItem,
                          disableMoveDown: isLastTimelineItem,
                        }
                      )}
                    </div>
                  )
                }

                const block = contentBlockById.get(timelineItem.contentBlockId)
                if (!block) return null
                const contentIndex = contentBlockIndexMap.get(block.id) ?? 0

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
                    <div className={`block-card ${isEditing ? 'editing' : ''} ${block.type === 'pullquote' ? 'pullquote' : ''}`}>
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
                          <span className="block-number">{contentIndex + 1}</span>
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

                      {isEditing ? (
                        <textarea
                          className={`block-textarea ${block.type === 'pullquote' ? 'pullquote' : ''}`}
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
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

                    {/* Image After Block */}
                    {block.imageAfter && (
                      <div className="block-image-container">
                        <div className="block-image">
                          {(() => {
                            const img = mediaAssets.find(m => m.id === block.imageAfter)
                            return img ? (
                              <>
                                <img src={getImageUrl(img)} alt={getMediaAssetAltText(img) || block.imageAfterAltText || ''} />
                                {!stagedArticle.publishedToPayload && (
                                  <button
                                    type="button"
                                    className="block-image-remove"
                                    onClick={() => removeImageAfterBlock(block.id)}
                                    title="Remove image"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <line x1="18" y1="6" x2="6" y2="18"/>
                                      <line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="block-image-missing">Image not found</span>
                            )
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Action Zone Between Blocks (fuse + add image + add block) */}
                    {contentIndex < stagedArticle.blocks.length - 1 && !stagedArticle.publishedToPayload && (
                      <div className="block-action-zone">
                        <div className="block-action-line" />
                        <div className="block-action-buttons">
                          {/* Fuse Button */}
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

                          {/* Add Image Button (only if no image already) */}
                          {!block.imageAfter && (
                            <button
                              type="button"
                              className="block-add-image-btn"
                              onClick={() => setBlockImageModal({ blockId: block.id, show: true })}
                              title="Add image between blocks"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                              Image
                            </button>
                          )}

                          {/* Add Block Button */}
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

                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add Block at End */}
              {!stagedArticle.publishedToPayload && (
                <button
                  type="button"
                  className="block-add-end-btn"
                  onClick={() => addNewBlock()}
                  title="Add new block at end"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Block
                </button>
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
                     hasBlockingEditorialBlocks ? 'Fix editorial blocks' :
                     !allFieldsFilled ? 'Complete fields below' :
                     'Publish to Payload'}
                  </button>
                  {!allFieldsFilled && (
                    <p className="stage-article-publish-hint">
                      Complete: {missingRequiredFields.join(', ')}
                    </p>
                  )}
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
                    onClick={() => {
                      setImageAltText('')
                      setImageNarrativeFocus('')
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
                  {mediaAssets
                    .filter(img =>
                      img.filename.toLowerCase().includes(imageSearch.toLowerCase()) ||
                      getMediaAssetAltText(img).toLowerCase().includes(imageSearch.toLowerCase())
                    )
                    .map(img => (
                      <button
                        key={img.id}
                        type="button"
                        className={`stage-article-modal-image ${selectedFeaturedImage?.id === img.id ? 'selected' : ''}`}
                        onClick={() => {
                          updateStagedArticle({ featuredImageId: img.id })
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

                {mediaAssets.length === 0 && (
                  <div className="stage-article-modal-empty">
                    <p>No images found in the media library.</p>
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
                  <ImageUpload
                    externalRef={stagedArticle.id}
                    token={token || ''}
                    altText={imageAltText}
                    narrativeFocus={imageNarrativeFocus}
                    onUploadComplete={handleUploadComplete}
                    onAltTextGenerated={(text) => setImageAltText(text)}
                    onNarrativeFocusChange={(text) => setImageNarrativeFocus(text)}
                    onCancel={() => setShowUploadModal(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Block Image Selection Modal */}
      {blockImageModal?.show && !stagedArticle.publishedToPayload && (
        <div className="stage-article-modal-overlay" onClick={() => setBlockImageModal(null)}>
          <div className="stage-article-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stage-article-modal-header">
              <h3>{showBlockUploadModal ? 'Upload New Image' : 'Add Image Between Blocks'}</h3>
              <button
                type="button"
                className="stage-article-modal-close"
                onClick={() => {
                  if (showBlockUploadModal) {
                    setShowBlockUploadModal(false)
                  } else {
                    setBlockImageModal(null)
                  }
                }}
              >
                ×
              </button>
            </div>

            {!showBlockUploadModal ? (
              <>
                <div className="stage-article-modal-actions">
                  <button
                    type="button"
                    className="stage-article-modal-upload-btn"
                    onClick={() => {
                      setBlockImageAltText('')
                      setBlockImageNarrativeFocus('')
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

                <div className="stage-article-modal-search">
                  <input
                    type="text"
                    placeholder="Search images..."
                    value={blockImageSearch}
                    onChange={(e) => setBlockImageSearch(e.target.value)}
                    className="stage-article-modal-search-input"
                  />
                </div>

                <div className="stage-article-modal-grid">
                  {mediaAssets
                    .filter(img =>
                      img.filename.toLowerCase().includes(blockImageSearch.toLowerCase()) ||
                      getMediaAssetAltText(img).toLowerCase().includes(blockImageSearch.toLowerCase())
                    )
                    .map(img => (
                      <button
                        key={img.id}
                        type="button"
                        className="stage-article-modal-image"
                        onClick={() => {
                          const preferredAsset = findPreferredVariantAsset(img.id, CONTENT_BLOCK_VARIANT)
                          if (!preferredAsset) return
                          addImageAfterBlock(
                            blockImageModal.blockId,
                            preferredAsset.id,
                            getMediaAssetAltText(preferredAsset)
                          )
                          setBlockImageModal(null)
                        }}
                      >
                        <img
                          src={getImageUrl(img)}
                          alt={getMediaAssetAltText(img) || img.filename}
                          loading="lazy"
                        />
                        <span className="stage-article-modal-image-name">{img.filename}</span>
                      </button>
                    ))}
                </div>

                {mediaAssets.length === 0 && (
                  <div className="stage-article-modal-empty">
                    <p>No images found in the media library.</p>
                  </div>
                )}

                <div className="stage-article-modal-footer">
                  <button
                    type="button"
                    className="stage-article-modal-done"
                    onClick={() => setBlockImageModal(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="stage-article-upload-section">
                  <ImageUpload
                    externalRef={`${stagedArticle.id}_block_${blockImageModal.blockId}`}
                    token={token || ''}
                    altText={blockImageAltText}
                    narrativeFocus={blockImageNarrativeFocus}
                    onUploadComplete={handleBlockImageUploadComplete}
                    onAltTextGenerated={(text) => setBlockImageAltText(text)}
                    onNarrativeFocusChange={(text) => setBlockImageNarrativeFocus(text)}
                    onCancel={() => setShowBlockUploadModal(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
