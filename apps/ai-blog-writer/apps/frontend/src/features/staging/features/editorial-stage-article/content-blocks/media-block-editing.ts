import type { ContentBlock, EditorialBlock } from '../../../types'
import { reanchorEditorialBlocksAfterBlockRemoval } from '../editorial-placement/reanchor-editorial-blocks'
import { createImgPairBlock, createImgTrioBlock } from './block-media'

export type MediaBlockEditResult = {
  blocks: ContentBlock[]
  editorialBlocks?: EditorialBlock[]
}

export function updateMediaGroupBlockCaption(
  blocks: ContentBlock[],
  blockId: string,
  caption: string
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.id !== blockId) return block
    if (block.type === 'img-pair' && block.imgPairAfter) {
      return createImgPairBlock(
        block.id,
        block.imgPairAfter.imageOne,
        block.imgPairAfter.imageTwo,
        caption
      )
    }
    if (block.type === 'img-trio' && block.imgTrioAfter) {
      return createImgTrioBlock(
        block.id,
        block.imgTrioAfter.format,
        block.imgTrioAfter.imageOne,
        block.imgTrioAfter.imageTwo,
        block.imgTrioAfter.imageThree,
        caption
      )
    }
    if (block.imgPairAfter) {
      return {
        ...block,
        imgPairAfter: {
          ...block.imgPairAfter,
          caption: caption || undefined
        }
      }
    }
    if (block.imgTrioAfter) {
      return {
        ...block,
        imgTrioAfter: {
          ...block.imgTrioAfter,
          caption: caption || undefined
        }
      }
    }
    return block
  })
}

export function removeMediaBlock(
  blocks: ContentBlock[],
  editorialBlocks: EditorialBlock[],
  blockId: string,
  mediaType: 'image' | 'img-pair' | 'img-trio'
): MediaBlockEditResult {
  const removedIndex = blocks.findIndex((block) => block.id === blockId)
  const targetBlock = blocks[removedIndex]

  if (targetBlock?.type === mediaType) {
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

  return {
    blocks: blocks.map((block) => {
      if (block.id !== blockId) return block
      if (mediaType === 'image') {
        return {
          ...block,
          imageAfter: undefined,
          imageAfterAltText: undefined
        }
      }
      if (mediaType === 'img-pair') {
        return { ...block, imgPairAfter: undefined }
      }
      return { ...block, imgTrioAfter: undefined }
    })
  }
}
