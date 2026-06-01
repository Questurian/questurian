import type { ContentBlock } from '../../../types'
import type { ImgTrioFormat } from '../types'

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
