import type { ContentBlock, EditorialBlock } from '../../../types'
import { isTextualBlock } from '../content-blocks/block-media'
import { normalizeEditorialBlocks } from '../editorial-markdown.service'

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
