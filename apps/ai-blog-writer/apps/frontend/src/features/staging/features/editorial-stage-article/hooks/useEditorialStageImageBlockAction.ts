import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { MediaAsset } from '../../../api'
import type { BlockImageModalState, ImgTrioFormat } from '../types'
import { IMG_BLOCK_MIN_HEIGHT, IMG_BLOCK_MIN_WIDTH } from '../constants'
import { getImgTrioDimensions, hasExactImgBlockDimensions, hasExactImgTrioDimensions } from '../media-utils'

type PublishResult = { success: boolean; message: string } | null

type UseEditorialStageImageBlockActionParams = {
  blockImageModal: BlockImageModalState | null
  requiredImageCount: number
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

/**
 * Builds the img-pair / img-trio block from an explicit list of selected assets.
 * The assets are supplied by the Image Picker (already resolved to the required
 * variant), so no re-resolution is needed here — only dimension validation and
 * the timeline insertion (ADR 0020).
 */
export function useEditorialStageImageBlockAction({
  blockImageModal,
  requiredImageCount,
  imgTrioFormat,
  imgBlockCaption,
  addImgPairAfterBlock,
  addImgTrioAfterBlock,
  mergeMediaAssetsIntoState,
  closeBlockImageModal,
  setPublishResult,
}: UseEditorialStageImageBlockActionParams) {
  return useCallback(
    (assets: MediaAsset[]) => {
      if (!blockImageModal || blockImageModal.mode === 'default') return
      if (assets.length !== requiredImageCount) return

      if (blockImageModal.mode === 'img') {
        const [imageOne, imageTwo] = assets
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

      const [imageOne, imageTwo, imageThree] = assets
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
    },
    [
      addImgPairAfterBlock,
      addImgTrioAfterBlock,
      blockImageModal,
      closeBlockImageModal,
      imgBlockCaption,
      imgTrioFormat,
      mergeMediaAssetsIntoState,
      requiredImageCount,
      setPublishResult,
    ]
  )
}
