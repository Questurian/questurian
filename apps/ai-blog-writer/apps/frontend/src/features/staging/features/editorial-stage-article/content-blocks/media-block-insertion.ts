import type { MediaAsset } from '../../../api'
import type { ContentBlock } from '../../../types'
import type { ImgTrioFormat } from '../types'
import {
  createImgPairBlock,
  createImgTrioBlock,
  createSingleImageBlock
} from './block-media'

export function insertOrReplaceSingleImageBlock(
  blocks: ContentBlock[],
  blockId: string,
  createBlockId: () => string,
  imageId: number,
  altText?: string,
  replaceExisting = false
): { blocks: ContentBlock[]; insertedBlockId: string } | null {
  const blockIndex = blocks.findIndex((block) => block.id === blockId)
  if (blockIndex === -1) {
    if (replaceExisting) return null
    const newBlockId = createBlockId()
    return {
      blocks: [...blocks, createSingleImageBlock(newBlockId, imageId, altText)],
      insertedBlockId: newBlockId
    }
  }

  const targetBlock = blocks[blockIndex]
  if (replaceExisting && targetBlock.type === 'image') {
    return {
      blocks: blocks.map((block) =>
        block.id === blockId
          ? createSingleImageBlock(blockId, imageId, altText)
          : block
      ),
      insertedBlockId: blockId
    }
  }

  const newBlockId = createBlockId()
  const newImageBlock = createSingleImageBlock(newBlockId, imageId, altText)
  return {
    blocks: [
      ...blocks.slice(0, blockIndex + 1),
      newImageBlock,
      ...blocks.slice(blockIndex + 1)
    ],
    insertedBlockId: newBlockId
  }
}

export function insertOrReplaceImgPairBlock(
  blocks: ContentBlock[],
  blockId: string,
  createBlockId: () => string,
  imageOne: MediaAsset,
  imageTwo: MediaAsset,
  caption?: string,
  replaceExisting = false
): ContentBlock[] | null {
  const blockIndex = blocks.findIndex((block) => block.id === blockId)
  if (blockIndex === -1) return null

  const targetBlock = blocks[blockIndex]
  if (replaceExisting && targetBlock.type === 'img-pair') {
    return blocks.map((block) =>
      block.id === blockId
        ? createImgPairBlock(blockId, imageOne.id, imageTwo.id, caption)
        : block
    )
  }

  const newBlockId = createBlockId()
  const newPairBlock = createImgPairBlock(
    newBlockId,
    imageOne.id,
    imageTwo.id,
    caption
  )
  return [
    ...blocks.slice(0, blockIndex + 1),
    newPairBlock,
    ...blocks.slice(blockIndex + 1)
  ]
}

export function insertOrReplaceImgTrioBlock(
  blocks: ContentBlock[],
  blockId: string,
  createBlockId: () => string,
  format: ImgTrioFormat,
  imageOne: MediaAsset,
  imageTwo: MediaAsset,
  imageThree: MediaAsset,
  caption?: string,
  replaceExisting = false
): ContentBlock[] | null {
  const blockIndex = blocks.findIndex((block) => block.id === blockId)
  if (blockIndex === -1) return null

  const targetBlock = blocks[blockIndex]
  if (replaceExisting && targetBlock.type === 'img-trio') {
    return blocks.map((block) =>
      block.id === blockId
        ? createImgTrioBlock(
            blockId,
            format,
            imageOne.id,
            imageTwo.id,
            imageThree.id,
            caption
          )
        : block
    )
  }

  const newBlockId = createBlockId()
  const newTrioBlock = createImgTrioBlock(
    newBlockId,
    format,
    imageOne.id,
    imageTwo.id,
    imageThree.id,
    caption
  )
  return [
    ...blocks.slice(0, blockIndex + 1),
    newTrioBlock,
    ...blocks.slice(blockIndex + 1)
  ]
}
