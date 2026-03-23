import type { ContentBlock, EditorialBlock } from '../../types'
import {
  extractEditorialBlocks,
  getEditorialBlockBody,
  normalizeEditorialBlocks,
} from './editorial-markdown.service'
import type { ImgTrioFormat } from './types'

export type TimelineItem =
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

export type NormalizeBlocksResult = {
  blocks: ContentBlock[]
  mediaBlockIdByLegacyAnchorId: Map<string, string>
}

export type BlockMediaPayload =
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

export function isStandaloneMediaBlock(block: ContentBlock): boolean {
  return block.type === 'image' || block.type === 'img-pair' || block.type === 'img-trio'
}

export function isTextualBlock(block: ContentBlock): boolean {
  return block.type === 'text' || block.type === 'pullquote'
}

export function createSingleImageBlock(
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

export function createImgPairBlock(
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

export function createImgTrioBlock(
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

export function getContentTimelineItemId(blockId: string): string {
  return `content:${blockId}`
}

export function getImageTimelineItemId(blockId: string): string {
  return `image:${blockId}`
}

export function getEditorialTimelineItemId(editorialBlockId: string): string {
  return `editorial:${editorialBlockId}`
}

export function getBlockMediaPayload(block: ContentBlock): BlockMediaPayload | null {
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

export function parseMarkdownToBlocksDetailed(markdown: string): {
  blocks: ContentBlock[]
  ranges: Array<{ id: string; startLine: number; endLine: number }>
} {
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

export function hasMeaningfulEditorialPlacement(
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

export async function fetchEditorialBlocksFromRun(
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

export function parseMarkdownToBlocks(markdown: string): ContentBlock[] {
  return parseMarkdownToBlocksDetailed(markdown).blocks
}

export function attachEditorialBlocksToContentBlocks(
  blocks: ContentBlock[],
  ranges: Array<{ id: string; startLine: number; endLine: number }>,
  editorialBlocks: EditorialBlock[],
  respectNullPlacement = false
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
    // Keep explicit "before all content" placement when caller signals existing positions are trusted.
    if (respectNullPlacement && block.afterBlockId === null) {
      return block
    }

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

export function composeArticleMarkdown(
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

export function buildAiArticleContext(
  timelineItems: TimelineItem[],
  blocks: ContentBlock[],
  editorialBlocks: EditorialBlock[]
): string {
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const editorialById = new Map(
    normalizeEditorialBlocks(editorialBlocks).map((block) => [block.id, block])
  )
  const parts: string[] = []
  let textSectionCount = 0

  timelineItems.forEach((item) => {
    if (item.type === 'image') {
      return
    }

    if (item.type === 'content') {
      const block = blockById.get(item.contentBlockId)
      if (!block || !isTextualBlock(block)) {
        return
      }

      const content = block.content.trim()
      if (!content) {
        return
      }

      textSectionCount += 1
      const label = block.type === 'pullquote'
        ? 'Pull Quote'
        : `Section ${textSectionCount}`
      parts.push(`### ${label}\n${content}`)
      return
    }

    const editorialBlock = editorialById.get(item.editorialBlockId)
    if (!editorialBlock) {
      return
    }

    const editorialBody = getEditorialBlockBody(editorialBlock.markdown).trim()
    if (!editorialBody) {
      return
    }

    const editorialLabel = editorialBlock.label?.trim() || 'Editorial'
    parts.push(`### Editorial: ${editorialLabel}\n${editorialBody}`)
  })

  return parts.join('\n\n').trim()
}

export function buildTimelineItems(
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

export function applyTimelineItemsToDraft(
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

export function normalizeBlocks(
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

export function migrateEditorialBlocksForStandaloneMedia(
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
