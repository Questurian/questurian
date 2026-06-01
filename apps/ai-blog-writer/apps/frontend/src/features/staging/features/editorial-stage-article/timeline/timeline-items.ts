import type { ContentBlock, EditorialBlock } from '../../../types'
import { isStandaloneMediaBlock } from '../content-blocks/block-media'
import { normalizeEditorialBlocks } from '../editorial-markdown.service'

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

export function getContentTimelineItemId(blockId: string): string {
  return `content:${blockId}`
}

export function getImageTimelineItemId(blockId: string): string {
  return `image:${blockId}`
}

export function getEditorialTimelineItemId(editorialBlockId: string): string {
  return `editorial:${editorialBlockId}`
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
