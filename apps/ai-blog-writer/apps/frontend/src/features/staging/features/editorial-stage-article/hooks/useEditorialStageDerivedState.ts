import { useMemo } from 'react'
import type { StagedArticle } from '../../../types'
import type {
  BlockImageModalState,
  ImgTrioFormat,
  MediaVariant,
} from '../types'
import type { EditorialPublishAnalysis } from '../editorial-markdown.service'
import {
  CONTENT_BLOCK_HEIGHT,
  CONTENT_BLOCK_VARIANT,
  CONTENT_BLOCK_WIDTH,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_VARIANT,
  FEATURED_IMAGE_WIDTH,
  IMG_BLOCK_MIN_HEIGHT,
  IMG_BLOCK_MIN_WIDTH,
  IMG_PAIR_REQUIRED_IMAGE_COUNT,
  IMG_TRIO_DIMENSIONS,
  IMG_TRIO_REQUIRED_IMAGE_COUNT,
} from '../constants'
import {
  getImgTrioDimensions,
  getMediaAssetAltText,
  hasExactContentBlockDimensions,
  hasExactFeaturedImageDimensions,
  hasExactImgBlockDimensions,
  hasExactImgTrioDimensions,
} from '../media-utils'
import type { TimelineItem } from '../workflow.service'
import type { Location, MediaAsset } from '../../../api'

type UseEditorialStageDerivedStateParams = {
  stagedArticle: StagedArticle
  locations: Location[]
  mediaAssets: MediaAsset[]
  timelineItems: TimelineItem[]
  editorialPublishAnalysis: EditorialPublishAnalysis
  imageSearch: string
  blockImageModal: BlockImageModalState | null
  blockImageSearch: string
  imgBlockAssets: MediaAsset[]
  selectedImgBlockAssetIds: number[]
  imgTrioFormat: ImgTrioFormat
  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
}

export function useEditorialStageDerivedState({
  stagedArticle,
  locations,
  mediaAssets,
  timelineItems,
  editorialPublishAnalysis,
  imageSearch,
  blockImageModal,
  blockImageSearch,
  imgBlockAssets,
  selectedImgBlockAssetIds,
  imgTrioFormat,
  findPreferredVariantAsset,
}: UseEditorialStageDerivedStateParams) {
  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === stagedArticle.locationId),
    [locations, stagedArticle.locationId]
  )

  const selectedFeaturedImage = useMemo(
    () => {
      if (!stagedArticle.featuredImageId) return null
      return (
        findPreferredVariantAsset(stagedArticle.featuredImageId, FEATURED_IMAGE_VARIANT)
        ?? mediaAssets.find((a) => a.id === stagedArticle.featuredImageId)
        ?? null
      )
    },
    [stagedArticle.featuredImageId, findPreferredVariantAsset, mediaAssets]
  )
  const hasFeaturedImageSelection = Boolean(stagedArticle.featuredImageId)

  const lastContentBlock = useMemo(
    () => (stagedArticle.blocks.length > 0 ? stagedArticle.blocks[stagedArticle.blocks.length - 1] : null),
    [stagedArticle.blocks]
  )

  const contentBlockById = useMemo(
    () => new Map(stagedArticle.blocks.map((block) => [block.id, block])),
    [stagedArticle.blocks]
  )
  const editorialBlockById = useMemo(
    () => new Map(stagedArticle.editorialBlocks.map((block) => [block.id, block])),
    [stagedArticle.editorialBlocks]
  )
  const contentBlockIndexMap = useMemo(
    () => new Map(stagedArticle.blocks.map((block, index) => [block.id, index])),
    [stagedArticle.blocks]
  )
  const timelineIndexMap = useMemo(
    () => new Map(timelineItems.map((item, index) => [item.id, index])),
    [timelineItems]
  )

  const {
    contentTimelineNumberMap,
    editorialTimelineNumberMap,
    imageTimelineNumberMap,
    totalTechnicalBlockCount,
  } = useMemo(() => {
    const contentMap = new Map<string, number>()
    const editorialMap = new Map<string, number>()
    const imageMap = new Map<string, number>()
    let technicalBlockCounter = 0

    timelineItems.forEach((item) => {
      technicalBlockCounter += 1
      if (item.type === 'content') {
        contentMap.set(item.contentBlockId, technicalBlockCounter)
        return
      }

      if (item.type === 'image') {
        imageMap.set(item.contentBlockId, technicalBlockCounter)
        return
      }

      editorialMap.set(item.editorialBlockId, technicalBlockCounter)
    })

    return {
      contentTimelineNumberMap: contentMap,
      editorialTimelineNumberMap: editorialMap,
      imageTimelineNumberMap: imageMap,
      totalTechnicalBlockCount: technicalBlockCounter,
    }
  }, [timelineItems])

  const hasTitle = Boolean(stagedArticle.title.trim())
  const allFieldsFilled = Boolean(selectedLocation && hasFeaturedImageSelection && hasTitle)
  const missingPublishFields: string[] = []
  if (!hasTitle) missingPublishFields.push('Article title')
  if (!selectedLocation) missingPublishFields.push('Location')
  if (!hasFeaturedImageSelection) missingPublishFields.push('Featured image')
  const editorialBlockingMessages = editorialPublishAnalysis.blockingBlocks.map(
    (blockingBlock) => blockingBlock.message
  )
  const hasMissingFeaturedImage = !hasFeaturedImageSelection

  const isImgBlockModal = blockImageModal?.mode === 'img'
  const isImgTrioModal = blockImageModal?.mode === 'img-trio'
  const isMultiImageModal = isImgBlockModal || isImgTrioModal

  const featuredImageRequirementLabel = `editorial | ${FEATURED_IMAGE_WIDTH}x${FEATURED_IMAGE_HEIGHT} | 4:3`
  const singleImageRequirementLabel = `wide | ${CONTENT_BLOCK_WIDTH}x${CONTENT_BLOCK_HEIGHT} | 16:9`
  const imgPairRequirementLabel = `portrait | ${IMG_BLOCK_MIN_WIDTH}x${IMG_BLOCK_MIN_HEIGHT} | 4:5 each`
  const imgTrioRequirementLabel = imgTrioFormat === 'square'
    ? `square | ${IMG_TRIO_DIMENSIONS.square.width}x${IMG_TRIO_DIMENSIONS.square.height} | 1:1 each`
    : `wide | ${IMG_TRIO_DIMENSIONS.landscape.width}x${IMG_TRIO_DIMENSIONS.landscape.height} | 16:9 each`
  const activeBlockImageRequirementLabel = isImgBlockModal
    ? imgPairRequirementLabel
    : isImgTrioModal
      ? imgTrioRequirementLabel
      : singleImageRequirementLabel

  const blockImageSearchableAssets = blockImageModal ? imgBlockAssets : mediaAssets
  const blockImageDimensionFilteredAssets = blockImageSearchableAssets.filter((img) => {
    if (isImgBlockModal) return hasExactImgBlockDimensions(img)
    if (isImgTrioModal) return hasExactImgTrioDimensions(img, imgTrioFormat)
    return true
  })
  const featuredImageVariantAssets = mediaAssets.filter((img) => {
    if (img.variant) return img.variant === FEATURED_IMAGE_VARIANT
    return hasExactFeaturedImageDimensions(img)
  })
  const filteredFeaturedImageAssets = featuredImageVariantAssets.filter((img) =>
    img.filename.toLowerCase().includes(imageSearch.toLowerCase())
    || getMediaAssetAltText(img).toLowerCase().includes(imageSearch.toLowerCase())
  )
  const blockImageVariantFilteredAssets = blockImageDimensionFilteredAssets.filter((img) => {
    if (blockImageModal?.mode !== 'default') return true
    if (img.variant) return img.variant === CONTENT_BLOCK_VARIANT
    return hasExactContentBlockDimensions(img)
  })
  const filteredBlockImageAssets = blockImageVariantFilteredAssets.filter((img) =>
    img.filename.toLowerCase().includes(blockImageSearch.toLowerCase())
    || getMediaAssetAltText(img).toLowerCase().includes(blockImageSearch.toLowerCase())
  )

  const imgTrioDimensions = getImgTrioDimensions(imgTrioFormat)
  const requiredImageCount = isImgTrioModal
    ? IMG_TRIO_REQUIRED_IMAGE_COUNT
    : IMG_PAIR_REQUIRED_IMAGE_COUNT
  const selectedImgBlockAssets = selectedImgBlockAssetIds
    .map((assetId) => blockImageDimensionFilteredAssets.find((asset) => asset.id === assetId))
    .filter((asset): asset is MediaAsset => Boolean(asset))

  return {
    selectedLocation,
    selectedFeaturedImage,
    lastContentBlock,
    contentBlockById,
    editorialBlockById,
    contentBlockIndexMap,
    timelineIndexMap,
    contentTimelineNumberMap,
    editorialTimelineNumberMap,
    imageTimelineNumberMap,
    totalTechnicalBlockCount,
    hasTitle,
    allFieldsFilled,
    missingPublishFields,
    editorialBlockingMessages,
    hasMissingFeaturedImage,
    isImgBlockModal,
    isImgTrioModal,
    isMultiImageModal,
    featuredImageRequirementLabel,
    singleImageRequirementLabel,
    imgPairRequirementLabel,
    imgTrioRequirementLabel,
    activeBlockImageRequirementLabel,
    filteredFeaturedImageAssets,
    filteredBlockImageAssets,
    imgTrioDimensions,
    requiredImageCount,
    selectedImgBlockAssets,
  }
}
