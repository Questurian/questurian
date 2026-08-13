import type { Dispatch, SetStateAction } from 'react'
import {
  ImagePicker,
  pickUploadedAssetId,
  type ImagePickerQuery,
  type ImagePickerResult,
  type ImagePickerSelectionMode,
} from '../../../../shared/images/picker'
import type { MediaAsset } from '../../api'
import {
  CONTENT_BLOCK_HEIGHT,
  CONTENT_BLOCK_VARIANT,
  CONTENT_BLOCK_WIDTH,
  IMG_BLOCK_MIN_HEIGHT,
  IMG_BLOCK_MIN_WIDTH,
  IMG_BLOCK_VARIANT,
  IMG_PAIR_REQUIRED_IMAGE_COUNT,
  IMG_TRIO_DIMENSIONS,
  IMG_TRIO_REQUIRED_IMAGE_COUNT,
} from '../../features/editorial-stage-article/constants'
import { getMediaAssetAltText } from '../../features/editorial-stage-article/media-utils'
import type { BlockImageModalState, ImgTrioFormat } from '../../features/editorial-stage-article/types'

type PublishResult = { success: boolean; message: string } | null

type BlockImageModalProps = {
  blockImageModal: BlockImageModalState | null
  publishedToPayload: boolean
  onClose: () => void
  locationRef: number | null
  singleImageRequirementLabel: string
  imgPairRequirementLabel: string
  imgTrioRequirementLabel: string
  imgTrioFormat: ImgTrioFormat
  setImgTrioFormat: Dispatch<SetStateAction<ImgTrioFormat>>
  imgBlockCaption: string
  setImgBlockCaption: Dispatch<SetStateAction<string>>
  addImageAfterBlock: (
    blockId: string,
    imageId: number,
    imageAfterAltText?: string,
    replaceExisting?: boolean
  ) => string | null
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
  getImageTimelineItemId: (blockId: string) => string
  mergeMediaAssetsIntoState: (assets: MediaAsset[]) => void
  setPublishResult: Dispatch<SetStateAction<PublishResult>>
  addSelectedImgBlock: (assets: MediaAsset[]) => void
}

const COULD_NOT_ADD_MESSAGE =
  'Could not add the image block. Try selecting the target position again.'

/**
 * Block-image selection, rendered by the unified {@link ImagePicker}. Single
 * blocks use single-select (wide 16:9); img-pair/img-trio use exact-N multi-select
 * (portrait 4:5 / square 1:1 or wide 16:9) with the caption and format controls in
 * the aboveGrid slot. Timeline insertion stays here behind onSelect (ADR 0020).
 */
export function BlockImageModal({
  blockImageModal,
  publishedToPayload,
  onClose,
  locationRef,
  singleImageRequirementLabel,
  imgPairRequirementLabel,
  imgTrioRequirementLabel,
  imgTrioFormat,
  setImgTrioFormat,
  imgBlockCaption,
  setImgBlockCaption,
  addImageAfterBlock,
  setActiveEditingTimelineItemId,
  getImageTimelineItemId,
  mergeMediaAssetsIntoState,
  setPublishResult,
  addSelectedImgBlock,
}: BlockImageModalProps) {
  if (!blockImageModal) return null

  const mode = blockImageModal.mode
  const isPair = mode === 'img'
  const isTrio = mode === 'img-trio'
  const isMulti = isPair || isTrio
  const blockId = blockImageModal.blockId
  const replaceExisting = blockImageModal.replaceExistingBlock === true

  const query: ImagePickerQuery = isPair
    ? {
        browseUnit: 'assets',
        variant: IMG_BLOCK_VARIANT,
        exactDimensions: { width: IMG_BLOCK_MIN_WIDTH, height: IMG_BLOCK_MIN_HEIGHT },
        requirementLabel: imgPairRequirementLabel,
      }
    : isTrio
      ? {
          browseUnit: 'assets',
          variant: imgTrioFormat === 'square' ? 'square' : CONTENT_BLOCK_VARIANT,
          exactDimensions: IMG_TRIO_DIMENSIONS[imgTrioFormat],
          requirementLabel: imgTrioRequirementLabel,
        }
      : {
          browseUnit: 'assets',
          variant: CONTENT_BLOCK_VARIANT,
          exactDimensions: { width: CONTENT_BLOCK_WIDTH, height: CONTENT_BLOCK_HEIGHT },
          requirementLabel: singleImageRequirementLabel,
        }

  const selection: ImagePickerSelectionMode = isPair
    ? { mode: 'multiple', count: IMG_PAIR_REQUIRED_IMAGE_COUNT }
    : isTrio
      ? { mode: 'multiple', count: IMG_TRIO_REQUIRED_IMAGE_COUNT }
      : { mode: 'single' }

  const insertSingle = (imageId: number, altText: string | undefined, asset: MediaAsset | null) => {
    const addedBlockId = addImageAfterBlock(blockId, imageId, altText, replaceExisting)
    if (!addedBlockId) {
      setPublishResult({ success: false, message: COULD_NOT_ADD_MESSAGE })
      return
    }
    setActiveEditingTimelineItemId(getImageTimelineItemId(addedBlockId))
    if (asset) mergeMediaAssetsIntoState([asset])
    // For uploads (no asset doc on hand) the referenced-asset hydration in
    // useEditorialStageMedia fills it into timeline state.
  }

  const handleSelect = (result: ImagePickerResult) => {
    if (isMulti) {
      if (result.kind === 'assets') addSelectedImgBlock(result.assets)
      return
    }
    if (result.kind === 'assets') {
      const asset = result.assets[0]
      if (asset) insertSingle(asset.id, getMediaAssetAltText(asset), asset)
      return
    }
    if (result.kind === 'upload') {
      const id = pickUploadedAssetId(result.response, CONTENT_BLOCK_VARIANT)
      if (id != null) insertSingle(id, undefined, null)
    }
  }

  const aboveGrid = isMulti ? (
    <div className="ip-search-row">
      {isTrio && (
        <select
          className="ip-search-select"
          value={imgTrioFormat}
          onChange={(event) => setImgTrioFormat(event.target.value as ImgTrioFormat)}
        >
          <option value="square">Square · 1:1</option>
          <option value="landscape">Landscape · 16:9</option>
        </select>
      )}
      <input
        type="text"
        className="ip-search-input"
        placeholder={isTrio ? 'Caption for all three images (optional)' : 'Caption for both images (optional)'}
        value={imgBlockCaption}
        onChange={(event) => setImgBlockCaption(event.target.value)}
      />
    </div>
  ) : undefined

  return (
    <ImagePicker
      isOpen={Boolean(blockImageModal.show) && !publishedToPayload}
      locationRef={locationRef}
      query={query}
      selection={selection}
      uploadExternalRefBase={`block-image-${blockId}`}
      uploadFileNameTitle="block-image"
      importAltContextLabel="Block image"
      aboveGrid={aboveGrid}
      confirmLabel={isTrio ? 'Add Img Trio' : 'Add Img Pair'}
      onSelect={handleSelect}
      onClose={onClose}
    />
  )
}
