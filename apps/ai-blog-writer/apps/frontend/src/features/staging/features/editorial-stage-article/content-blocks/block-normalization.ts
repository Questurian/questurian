import type { ContentBlock, EditorialBlock } from '../../../types'
import { normalizeEditorialBlocks } from '../editorial-markdown.service'
import {
  createImgPairBlock,
  createImgTrioBlock,
  createSingleImageBlock,
} from './block-media'
import { parseMarkdownToBlocks } from './markdown-block-parser'

export type NormalizeBlocksResult = {
  blocks: ContentBlock[]
  mediaBlockIdByLegacyAnchorId: Map<string, string>
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
