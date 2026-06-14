import type { Dispatch, SetStateAction } from 'react'
import type { Location, MediaAsset } from '../../../api'
import { isStagedArticleEditingLocked } from '../../../utils/staged-article-sync'
import type { BlockImageModalState, ImgTrioFormat } from '../types'
import type { BlockModalViewProps, PublishResult } from './editorial-stage-view.types'

type BuildBlockModalViewInput = {
  stagedArticle: {
    publishedToPayload: boolean
    syncBehavior?: 'finalize' | 'draft-sync'
  }
  blockImageModal: BlockImageModalState | null
  closeBlockImageModal: () => void
  token?: string
  selectedLocation?: Location
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
  mergeMediaAssetsIntoState: (newAssets: MediaAsset[]) => void
  setPublishResult: Dispatch<SetStateAction<PublishResult>>
  handleAddSelectedImgBlock: (assets: MediaAsset[]) => void
}

export function buildBlockModalView(input: BuildBlockModalViewInput): BlockModalViewProps {
  return {
    blockImageModal: input.blockImageModal,
    publishedToPayload: isStagedArticleEditingLocked(input.stagedArticle),
    onClose: input.closeBlockImageModal,
    token: input.token,
    locationRef: input.selectedLocation?.id ?? null,
    singleImageRequirementLabel: input.singleImageRequirementLabel,
    imgPairRequirementLabel: input.imgPairRequirementLabel,
    imgTrioRequirementLabel: input.imgTrioRequirementLabel,
    imgTrioFormat: input.imgTrioFormat,
    setImgTrioFormat: input.setImgTrioFormat,
    imgBlockCaption: input.imgBlockCaption,
    setImgBlockCaption: input.setImgBlockCaption,
    addImageAfterBlock: input.addImageAfterBlock,
    setActiveEditingTimelineItemId: input.setActiveEditingTimelineItemId,
    getImageTimelineItemId: input.getImageTimelineItemId,
    mergeMediaAssetsIntoState: input.mergeMediaAssetsIntoState,
    setPublishResult: input.setPublishResult,
    addSelectedImgBlock: input.handleAddSelectedImgBlock,
  }
}
