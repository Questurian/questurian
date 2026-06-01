import type { ContentBlock, EditorialBlock } from '../../../types'
import { isStandaloneMediaBlock } from '../content-blocks/block-media'
import { normalizeEditorialBlocks } from '../editorial-markdown.service'
import type { TimelineItem } from './timeline-items'

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
