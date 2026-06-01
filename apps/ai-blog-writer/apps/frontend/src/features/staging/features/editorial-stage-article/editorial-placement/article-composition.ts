import type { ContentBlock, EditorialBlock } from '../../../types'
import { isTextualBlock } from '../content-blocks/block-media'
import {
  getEditorialBlockBody,
  normalizeEditorialBlocks,
} from '../editorial-markdown.service'
import type { TimelineItem } from '../timeline/timeline-items'

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
