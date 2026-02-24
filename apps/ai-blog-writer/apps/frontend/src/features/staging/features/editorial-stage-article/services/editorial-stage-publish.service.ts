import type { MediaAsset } from '../../../api'
import type { StagedArticle } from '../../../types'
import type { EditorialPublishAnalysis, PayloadContentBlock } from '../editorial-markdown.service'
import { IMG_BLOCK_MIN_HEIGHT, IMG_BLOCK_MIN_WIDTH } from '../constants'
import {
  getImgTrioDimensions,
  getMediaAssetAltText,
  hasExactImgBlockDimensions,
  hasExactImgTrioDimensions,
} from '../media-utils'
import { getBlockMediaPayload } from '../workflow.service'
import type { TimelineItem } from '../workflow.service'

type BuildPayloadContentBlocksParams = {
  stagedArticle: StagedArticle
  timelineItems: TimelineItem[]
  editorialPublishAnalysis: EditorialPublishAnalysis
  mediaAssets: MediaAsset[]
  convertMarkdownToLexical: (markdown: string) => Promise<{
    success: boolean
    data?: object
    error?: string
  }>
}

export async function buildPayloadContentBlocks({
  stagedArticle,
  timelineItems,
  editorialPublishAnalysis,
  mediaAssets,
  convertMarkdownToLexical,
}: BuildPayloadContentBlocksParams): Promise<{
  contentBlocks: PayloadContentBlock[]
  textBlocksAdded: number
}> {
  const blockById = new Map(stagedArticle.blocks.map((block) => [block.id, block]))
  const editorialById = new Map(
    (stagedArticle.editorialBlocks || []).map((block) => [block.id, block])
  )

  const contentBlocks: PayloadContentBlock[] = []
  const processedBlockIds = new Set<string>()
  const processedEditorialIds = new Set<string>()
  let textBlocksAdded = 0

  // Publish in exact UI stack order.
  for (const [timelineIndex, timelineItem] of timelineItems.entries()) {
    if (timelineItem.type === 'editorial') {
      const editorialBlock = editorialById.get(timelineItem.editorialBlockId)
      if (!editorialBlock || processedEditorialIds.has(editorialBlock.id)) continue
      const validation = editorialPublishAnalysis.byId[editorialBlock.id]
      if (!validation || validation.status !== 'supported') continue
      contentBlocks.push(validation.payloadBlock)
      processedEditorialIds.add(editorialBlock.id)
      continue
    }

    const block = blockById.get(timelineItem.contentBlockId)
    if (!block || processedBlockIds.has(block.id)) continue
    processedBlockIds.add(block.id)

    if (timelineItem.type === 'content') {
      const markdown = block.content.trim()
      if (!markdown) continue
      const lexicalResult = await convertMarkdownToLexical(markdown)
      if (!lexicalResult.success || !lexicalResult.data) {
        throw new Error(
          lexicalResult.error
          || `Failed to convert block ${timelineIndex + 1} to Lexical`
        )
      }

      contentBlocks.push({
        blockType: 'text',
        content: lexicalResult.data,
      })
      textBlocksAdded += 1
      continue
    }

    const mediaPayload = getBlockMediaPayload(block)
    if (!mediaPayload) continue

    if (mediaPayload.type === 'single') {
      const imageAsset = mediaAssets.find((asset) => asset.id === mediaPayload.imageAfter)
      const altText = (
        mediaPayload.imageAfterAltText?.trim()
        || getMediaAssetAltText(imageAsset)
      ).trim()
      if (!altText) {
        throw new Error(`Image block ${timelineIndex + 1} is missing alt text`)
      }

      contentBlocks.push({
        blockType: 'image',
        image: mediaPayload.imageAfter,
        altText,
      })
      continue
    }

    if (mediaPayload.type === 'pair') {
      const imageOneAsset = mediaAssets.find((asset) => asset.id === mediaPayload.imgPairAfter.imageOne)
      const imageTwoAsset = mediaAssets.find((asset) => asset.id === mediaPayload.imgPairAfter.imageTwo)
      if (!hasExactImgBlockDimensions(imageOneAsset) || !hasExactImgBlockDimensions(imageTwoAsset)) {
        throw new Error(
          `Img pair block ${timelineIndex + 1} must be exactly ${IMG_BLOCK_MIN_WIDTH}x${IMG_BLOCK_MIN_HEIGHT}`
        )
      }

      contentBlocks.push({
        blockType: 'img-pair',
        imageOne: mediaPayload.imgPairAfter.imageOne,
        imageTwo: mediaPayload.imgPairAfter.imageTwo,
        caption: mediaPayload.imgPairAfter.caption?.trim() || undefined,
      })
      continue
    }

    const imageOneAsset = mediaAssets.find((asset) => asset.id === mediaPayload.imgTrioAfter.imageOne)
    const imageTwoAsset = mediaAssets.find((asset) => asset.id === mediaPayload.imgTrioAfter.imageTwo)
    const imageThreeAsset = mediaAssets.find((asset) => asset.id === mediaPayload.imgTrioAfter.imageThree)
    if (
      !hasExactImgTrioDimensions(imageOneAsset, mediaPayload.imgTrioAfter.format)
      || !hasExactImgTrioDimensions(imageTwoAsset, mediaPayload.imgTrioAfter.format)
      || !hasExactImgTrioDimensions(imageThreeAsset, mediaPayload.imgTrioAfter.format)
    ) {
      const dims = getImgTrioDimensions(mediaPayload.imgTrioAfter.format)
      throw new Error(
        `Img trio block ${timelineIndex + 1} must be exactly ${dims.width}x${dims.height}`
      )
    }

    contentBlocks.push({
      blockType: 'img-trio',
      format: mediaPayload.imgTrioAfter.format,
      imageOne: mediaPayload.imgTrioAfter.imageOne,
      imageTwo: mediaPayload.imgTrioAfter.imageTwo,
      imageThree: mediaPayload.imgTrioAfter.imageThree,
      caption: mediaPayload.imgTrioAfter.caption?.trim() || undefined,
    })
  }

  return { contentBlocks, textBlocksAdded }
}
