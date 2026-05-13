import type { Dispatch, SetStateAction, ReactNode } from 'react'
import type { UploadImageResponse } from '../../../../../shared/images'
import type { Location, MediaAsset, PexelsPhoto, UnsplashPhoto } from '../../../api'
import { isStagedArticleEditingLocked } from '../../../utils/staged-article-sync'
import type {
  BlockImageModalState,
  ExternalImageCropDraft,
  ImageSourceOption,
  ImgTrioFormat,
  MediaVariant,
  PexelsOrientationOption,
} from '../types'
import type { BlockModalViewProps, PublishResult } from './editorial-stage-view.types'

type BuildBlockModalViewInput = {
  stagedArticle: {
    publishedToPayload: boolean
    syncBehavior?: 'finalize' | 'draft-sync'
  }
  blockImageModal: BlockImageModalState | null
  closeBlockImageModal: () => void
  blockImageSource: ImageSourceOption
  setBlockImageSource: Dispatch<SetStateAction<ImageSourceOption>>
  isImgBlockModal: boolean
  isImgTrioModal: boolean
  isMultiImageModal: boolean
  singleImageRequirementLabel: string
  imgPairRequirementLabel: string
  imgTrioRequirementLabel: string
  activeBlockImageRequirementLabel: string
  imgTrioFormat: ImgTrioFormat
  setImgTrioFormat: Dispatch<SetStateAction<ImgTrioFormat>>
  imgBlockCaption: string
  setImgBlockCaption: Dispatch<SetStateAction<string>>
  blockImageSearch: string
  setBlockImageSearch: Dispatch<SetStateAction<string>>
  isLoadingImgBlockAssets: boolean
  imgBlockAssetsError: string | null
  hasMoreImgBlockAssets: boolean
  loadMoreImgBlockAssets: () => Promise<void>
  filteredBlockImageAssets: MediaAsset[]
  selectedImgBlockAssetIds: number[]
  toggleImgBlockAssetSelection: (assetId: number, requiredCount: number) => void
  requiredImageCount: number
  selectedImgBlockAssetsCount: number
  handleAddSelectedImgBlock: () => void
  imgTrioDimensions: { width: number; height: number }

  selectedLocation?: Location
  blockImageExternalRef: string
  blockImageFileNamePrefix?: string
  token?: string
  blockImageAltText: string
  blockImagePhotographerCredit: string
  setBlockImageAltText: Dispatch<SetStateAction<string>>
  setBlockImagePhotographerCredit: Dispatch<SetStateAction<string>>
  handleBlockImageUploadComplete: (result: UploadImageResponse) => void

  externalImageCropDraft: ExternalImageCropDraft | null
  renderExternalCropEditor: (context: 'block') => ReactNode
  unsplashBlockQuery: string
  setUnsplashBlockQuery: Dispatch<SetStateAction<string>>
  unsplashBlockOrientation: PexelsOrientationOption
  setUnsplashBlockOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  unsplashBlockPerPage: number
  setUnsplashBlockPerPage: Dispatch<SetStateAction<number>>
  runBlockUnsplashSearch: () => Promise<void>
  isSearchingUnsplashBlock: boolean
  unsplashBlockError: string | null
  unsplashBlockResults: UnsplashPhoto[]
  isImportingBlockExternalImage: boolean
  handleImportBlockExternalImage: (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: 'unsplash' | 'pexels'
  ) => Promise<void>
  pexelsBlockQuery: string
  setPexelsBlockQuery: Dispatch<SetStateAction<string>>
  pexelsBlockOrientation: PexelsOrientationOption
  setPexelsBlockOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  pexelsBlockPerPage: number
  setPexelsBlockPerPage: Dispatch<SetStateAction<number>>
  runBlockPexelsSearch: () => Promise<void>
  isSearchingPexelsBlock: boolean
  pexelsBlockError: string | null
  pexelsBlockResults: PexelsPhoto[]
  isUploadingExternalImageVariants: boolean

  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
  addImageAfterBlock: (
    blockId: string,
    imageId: number,
    imageAfterAltText?: string,
    replaceExisting?: boolean
  ) => string | null
  setPublishResult: Dispatch<SetStateAction<PublishResult>>
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
  getImageTimelineItemId: (blockId: string) => string
  mergeMediaAssetsIntoState: (newAssets: MediaAsset[]) => void
  getImageUrl: (img: MediaAsset) => string
}

export function buildBlockModalView(input: BuildBlockModalViewInput): BlockModalViewProps {
  return {
    base: {
      show: Boolean(input.blockImageModal?.show),
      publishedToPayload: isStagedArticleEditingLocked(input.stagedArticle),
      onClose: input.closeBlockImageModal,
      blockImageModal: input.blockImageModal,
      isImgBlockModal: input.isImgBlockModal,
      isImgTrioModal: input.isImgTrioModal,
      isMultiImageModal: input.isMultiImageModal,
      singleImageRequirementLabel: input.singleImageRequirementLabel,
      imgPairRequirementLabel: input.imgPairRequirementLabel,
      imgTrioRequirementLabel: input.imgTrioRequirementLabel,
      activeBlockImageRequirementLabel: input.activeBlockImageRequirementLabel,
    },
    payload: {
      blockImageSource: input.blockImageSource,
      imgTrioFormat: input.imgTrioFormat,
      setImgTrioFormat: input.setImgTrioFormat,
      imgBlockCaption: input.imgBlockCaption,
      setImgBlockCaption: input.setImgBlockCaption,
      blockImageSearch: input.blockImageSearch,
      setBlockImageSearch: input.setBlockImageSearch,
      isLoadingImgBlockAssets: input.isLoadingImgBlockAssets,
      imgBlockAssetsError: input.imgBlockAssetsError,
      hasMoreImgBlockAssets: input.hasMoreImgBlockAssets,
      loadMoreImgBlockAssets: input.loadMoreImgBlockAssets,
      filteredBlockImageAssets: input.filteredBlockImageAssets,
      selectedImgBlockAssetIds: input.selectedImgBlockAssetIds,
      toggleImgBlockAssetSelection: input.toggleImgBlockAssetSelection,
      requiredImageCount: input.requiredImageCount,
      selectedImgBlockAssetsCount: input.selectedImgBlockAssetsCount,
      handleAddSelectedImgBlock: input.handleAddSelectedImgBlock,
      imgTrioDimensions: input.imgTrioDimensions,
    },
    upload: {
      selectedLocation: input.selectedLocation,
      blockImageExternalRef: input.blockImageExternalRef,
      blockImageFileNamePrefix: input.blockImageFileNamePrefix,
      token: input.token,
      blockImageAltText: input.blockImageAltText,
      blockImagePhotographerCredit: input.blockImagePhotographerCredit,
      setBlockImageAltText: input.setBlockImageAltText,
      setBlockImagePhotographerCredit: input.setBlockImagePhotographerCredit,
      handleBlockImageUploadComplete: input.handleBlockImageUploadComplete,
    },
    external: {
      externalImageCropDraft: input.externalImageCropDraft,
      renderExternalCropEditor: input.renderExternalCropEditor,
      unsplashBlockQuery: input.unsplashBlockQuery,
      setUnsplashBlockQuery: input.setUnsplashBlockQuery,
      unsplashBlockOrientation: input.unsplashBlockOrientation,
      setUnsplashBlockOrientation: input.setUnsplashBlockOrientation,
      unsplashBlockPerPage: input.unsplashBlockPerPage,
      setUnsplashBlockPerPage: input.setUnsplashBlockPerPage,
      runBlockUnsplashSearch: input.runBlockUnsplashSearch,
      isSearchingUnsplashBlock: input.isSearchingUnsplashBlock,
      unsplashBlockError: input.unsplashBlockError,
      unsplashBlockResults: input.unsplashBlockResults,
      isImportingBlockExternalImage: input.isImportingBlockExternalImage,
      handleImportBlockExternalImage: input.handleImportBlockExternalImage,
      pexelsBlockQuery: input.pexelsBlockQuery,
      setPexelsBlockQuery: input.setPexelsBlockQuery,
      pexelsBlockOrientation: input.pexelsBlockOrientation,
      setPexelsBlockOrientation: input.setPexelsBlockOrientation,
      pexelsBlockPerPage: input.pexelsBlockPerPage,
      setPexelsBlockPerPage: input.setPexelsBlockPerPage,
      runBlockPexelsSearch: input.runBlockPexelsSearch,
      isSearchingPexelsBlock: input.isSearchingPexelsBlock,
      pexelsBlockError: input.pexelsBlockError,
      pexelsBlockResults: input.pexelsBlockResults,
      isUploadingExternalImageVariants: input.isUploadingExternalImageVariants,
    },
    actions: {
      setBlockImageSource: input.setBlockImageSource,
      findPreferredVariantAsset: input.findPreferredVariantAsset,
      addImageAfterBlock: input.addImageAfterBlock,
      setPublishResult: input.setPublishResult,
      setActiveEditingTimelineItemId: input.setActiveEditingTimelineItemId,
      getImageTimelineItemId: input.getImageTimelineItemId,
      mergeMediaAssetsIntoState: input.mergeMediaAssetsIntoState,
      getImageUrl: input.getImageUrl,
    },
  }
}
