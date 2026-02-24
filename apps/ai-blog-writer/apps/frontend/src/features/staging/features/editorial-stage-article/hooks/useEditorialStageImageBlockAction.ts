import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { MediaAsset } from '../../../api'
import type {
  BlockImageModalState,
  ImgTrioFormat,
  MediaVariant,
} from '../types'
import {
  IMG_BLOCK_MIN_HEIGHT,
  IMG_BLOCK_MIN_WIDTH,
  IMG_BLOCK_VARIANT,
} from '../constants'
import {
  getImgTrioDimensions,
  hasExactImgBlockDimensions,
  hasExactImgTrioDimensions,
} from '../media-utils'

type PublishResult = { success: boolean; message: string } | null

type UseEditorialStageImageBlockActionParams = {
  blockImageModal: BlockImageModalState | null
  selectedImgBlockAssets: MediaAsset[]
  requiredImageCount: number
  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
  imgTrioFormat: ImgTrioFormat
  imgBlockCaption: string
  addImgPairAfterBlock: (
    blockId: string,
    imageOne: MediaAsset,
    imageTwo: MediaAsset,
    caption?: string,
    replaceExisting?: boolean
  ) => void
  addImgTrioAfterBlock: (
    blockId: string,
    format: ImgTrioFormat,
    imageOne: MediaAsset,
    imageTwo: MediaAsset,
    imageThree: MediaAsset,
    caption?: string,
    replaceExisting?: boolean
  ) => void
  mergeMediaAssetsIntoState: (assets: MediaAsset[]) => void
  closeBlockImageModal: () => void
  setPublishResult: Dispatch<SetStateAction<PublishResult>>
}

export function useEditorialStageImageBlockAction({
  blockImageModal,
  selectedImgBlockAssets,
  requiredImageCount,
  findPreferredVariantAsset,
  imgTrioFormat,
  imgBlockCaption,
  addImgPairAfterBlock,
  addImgTrioAfterBlock,
  mergeMediaAssetsIntoState,
  closeBlockImageModal,
  setPublishResult,
}: UseEditorialStageImageBlockActionParams) {
  return useCallback(() => {
    if (!blockImageModal || blockImageModal.mode === 'default') return
    if (selectedImgBlockAssets.length !== requiredImageCount) return

    if (blockImageModal.mode === 'img') {
      const [rawImageOne, rawImageTwo] = selectedImgBlockAssets
      const imageOne = findPreferredVariantAsset(rawImageOne.id, IMG_BLOCK_VARIANT)
      const imageTwo = findPreferredVariantAsset(rawImageTwo.id, IMG_BLOCK_VARIANT)
      if (!imageOne || !imageTwo) return
      if (!hasExactImgBlockDimensions(imageOne) || !hasExactImgBlockDimensions(imageTwo)) {
        setPublishResult({
          success: false,
          message: `Img pair requires exactly ${IMG_BLOCK_MIN_WIDTH}x${IMG_BLOCK_MIN_HEIGHT} images`,
        })
        return
      }

      addImgPairAfterBlock(
        blockImageModal.blockId,
        imageOne,
        imageTwo,
        imgBlockCaption,
        blockImageModal.replaceExistingBlock === true
      )
      mergeMediaAssetsIntoState([imageOne, imageTwo])
      closeBlockImageModal()
      return
    }

    const [rawImageOne, rawImageTwo, rawImageThree] = selectedImgBlockAssets
    const preferredVariant: MediaVariant = imgTrioFormat === 'square' ? 'square' : 'wide'
    const imageOne = findPreferredVariantAsset(rawImageOne.id, preferredVariant)
    const imageTwo = findPreferredVariantAsset(rawImageTwo.id, preferredVariant)
    const imageThree = findPreferredVariantAsset(rawImageThree.id, preferredVariant)
    if (!imageOne || !imageTwo || !imageThree) return

    if (
      !hasExactImgTrioDimensions(imageOne, imgTrioFormat)
      || !hasExactImgTrioDimensions(imageTwo, imgTrioFormat)
      || !hasExactImgTrioDimensions(imageThree, imgTrioFormat)
    ) {
      const dims = getImgTrioDimensions(imgTrioFormat)
      setPublishResult({
        success: false,
        message: `Img trio (${imgTrioFormat}) requires exactly ${dims.width}x${dims.height} images`,
      })
      return
    }

    addImgTrioAfterBlock(
      blockImageModal.blockId,
      imgTrioFormat,
      imageOne,
      imageTwo,
      imageThree,
      imgBlockCaption,
      blockImageModal.replaceExistingBlock === true
    )
    mergeMediaAssetsIntoState([imageOne, imageTwo, imageThree])
    closeBlockImageModal()
  }, [
    addImgPairAfterBlock,
    addImgTrioAfterBlock,
    blockImageModal,
    closeBlockImageModal,
    findPreferredVariantAsset,
    imgBlockCaption,
    imgTrioFormat,
    mergeMediaAssetsIntoState,
    requiredImageCount,
    selectedImgBlockAssets,
    setPublishResult,
  ])
}
