import type { ContentBlock, EditorialBlock } from '../../../types'
import { reanchorEditorialBlocksAfterBlockRemoval } from '../editorial-placement/reanchor-editorial-blocks'
import { isTextualBlock } from './block-media'

export type BlockEditResult = {
  blocks: ContentBlock[]
  editorialBlocks: EditorialBlock[]
}

export function findHeaderSplitPoints(
  content: string
): { lineIndex: number; headerText: string }[] {
  const lines = content.split('\n')
  const splitPoints: { lineIndex: number; headerText: string }[] = []

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/^#{1,6}\s/.test(line) && index > 0) {
      splitPoints.push({
        lineIndex: index,
        headerText: line.replace(/^#+\s*/, '')
      })
    }
  }

  return splitPoints
}

export function mergeTextBlockWithNext(
  blocks: ContentBlock[],
  editorialBlocks: EditorialBlock[],
  blockId: string
): BlockEditResult | null {
  const blockIndex = blocks.findIndex((block) => block.id === blockId)
  if (blockIndex === -1 || blockIndex >= blocks.length - 1) return null

  const currentBlock = blocks[blockIndex]
  const nextBlock = blocks[blockIndex + 1]
  if (!isTextualBlock(currentBlock) || !isTextualBlock(nextBlock)) return null

  const mergedBlock: ContentBlock = {
    id: currentBlock.id,
    type: currentBlock.type === 'pullquote' ? 'pullquote' : 'text',
    content: `${currentBlock.content}\n\n${nextBlock.content}`
  }

  return {
    blocks: [
      ...blocks.slice(0, blockIndex),
      mergedBlock,
      ...blocks.slice(blockIndex + 2)
    ],
    editorialBlocks: editorialBlocks.map((editorialBlock) =>
      editorialBlock.afterBlockId === nextBlock.id
        ? { ...editorialBlock, afterBlockId: currentBlock.id }
        : editorialBlock
    )
  }
}

export function splitTextBlockAtLine(
  blocks: ContentBlock[],
  editorialBlocks: EditorialBlock[],
  blockId: string,
  lineIndex: number,
  createSecondBlockId: () => string
): BlockEditResult | null {
  const blockIndex = blocks.findIndex((block) => block.id === blockId)
  if (blockIndex === -1) return null

  const block = blocks[blockIndex]
  if (!isTextualBlock(block)) return null

  const lines = block.content.split('\n')
  const beforeContent = lines.slice(0, lineIndex).join('\n').trim()
  const afterContent = lines.slice(lineIndex).join('\n').trim()
  if (!beforeContent || !afterContent) return null

  const secondBlockId = createSecondBlockId()
  const blockType = block.type === 'pullquote' ? 'pullquote' : 'text'
  const splitBlocks: ContentBlock[] = [
    { id: block.id, type: blockType, content: beforeContent },
    { id: secondBlockId, type: blockType, content: afterContent }
  ]

  return {
    blocks: [
      ...blocks.slice(0, blockIndex),
      ...splitBlocks,
      ...blocks.slice(blockIndex + 1)
    ],
    editorialBlocks: editorialBlocks.map((editorialBlock) =>
      editorialBlock.afterBlockId === block.id
        ? { ...editorialBlock, afterBlockId: secondBlockId }
        : editorialBlock
    )
  }
}

export function insertContentBlock(
  blocks: ContentBlock[],
  newBlock: ContentBlock,
  afterBlockId?: string
): ContentBlock[] | null {
  if (!afterBlockId) return [...blocks, newBlock]

  const blockIndex = blocks.findIndex((block) => block.id === afterBlockId)
  if (blockIndex === -1) return null

  return [
    ...blocks.slice(0, blockIndex + 1),
    newBlock,
    ...blocks.slice(blockIndex + 1)
  ]
}

export function removeContentBlock(
  blocks: ContentBlock[],
  editorialBlocks: EditorialBlock[],
  blockId: string
): BlockEditResult | null {
  const removedIndex = blocks.findIndex((block) => block.id === blockId)
  if (removedIndex === -1) return null

  const fallbackAfterBlockId =
    removedIndex > 0 ? blocks[removedIndex - 1].id : null

  return {
    blocks: blocks.filter((block) => block.id !== blockId),
    editorialBlocks: reanchorEditorialBlocksAfterBlockRemoval(
      editorialBlocks,
      blockId,
      fallbackAfterBlockId
    )
  }
}
