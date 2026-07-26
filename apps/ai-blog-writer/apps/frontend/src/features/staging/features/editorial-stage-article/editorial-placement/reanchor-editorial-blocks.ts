import type { EditorialBlock } from '../../../types'

export function reanchorEditorialBlocksAfterBlockRemoval(
  editorialBlocks: EditorialBlock[],
  removedBlockId: string,
  fallbackAfterBlockId: string | null
): EditorialBlock[] {
  return editorialBlocks.map((editorialBlock) => {
    if (editorialBlock.afterBlockId !== removedBlockId) {
      return editorialBlock
    }

    return {
      ...editorialBlock,
      afterBlockId: fallbackAfterBlockId,
      placeAfterImage: false
    }
  })
}
