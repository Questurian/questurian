import { type Dispatch, type SetStateAction } from 'react'
import type { StagedArticle } from '../../../types'
import type { Location, MediaAsset } from '../../../api'
import type { TimelineItem } from '../workflow.service'
import { getMediaAssetUrl } from '../utils/editorial-stage-view.utils'
import { buildImageFileNamePrefix } from '../media-utils'
import {
  buildBlockModalView,
  buildFeaturedModalView,
  buildSidebarView,
  buildTimelineListView,
  type BlockModalViewProps,
  type FeaturedModalViewProps,
  type SidebarViewProps,
  type TimelineListViewProps,
  type PublishResult,
} from '../selectors'
import { getImageTimelineItemId } from '../workflow.service'
import { useEditorialStageDerivedState } from './useEditorialStageDerivedState'
import { useEditorialStageImageBlockAction } from './useEditorialStageImageBlockAction'
import type {
  EditorialStageLayoutView,
} from '../view-model/types'
import type {
  BlockImageModalState,
  ImgTrioFormat,
  MediaVariant,
  SupportedEditorialComponent,
  OpenBlockImageModalOptions,
  PexelsOrientationOption,
  ExternalImageCropDraft,
  ImageSourceOption,
} from '../types'
import type { UploadImageResponse } from '../../../../../shared/images'
import type { PexelsPhoto, UnsplashPhoto } from '../../../api'
import type { EditorialPublishAnalysis } from '../editorial-markdown.service'

type UseEditorialStageLoadedArticleViewsParams = {
  stagedArticle: StagedArticle
  stagePath: string
  token: string | null | undefined
  locations: Location[]
  mediaAssets: MediaAsset[]
  timelineItems: TimelineItem[]
  activeEditingTimelineItemId: string | null
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
  draggedTimelineItemId: string | null
  dragOverTimelineItemId: string | null
  handleDragStart: (e: React.DragEvent, timelineItemId: string) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent, timelineItemId: string) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent, targetTimelineItemId: string) => void
  moveTimelineItem: (timelineItemId: string, direction: 'up' | 'down') => void
  toggleTimelineItemEdit: (timelineItemId: string) => void
  editorialPublishAnalysis: EditorialPublishAnalysis
  fixEditorialBlock: (blockId: string) => void
  updateEditorialBlockMarkdown: (blockId: string, nextMarkdown: string) => void
  removeEditorialBlock: (blockId: string) => void
  updateBlockContent: (blockId: string, newContent: string) => void
  rewriteTextBlockWithAi: (
    blockId: string,
    currentContent: string,
    prompt: string,
    includeWholeArticleContext: boolean
  ) => Promise<string>
  addImageAfterBlock: (
    blockId: string,
    imageId: number,
    imageAfterAltText?: string,
    replaceExisting?: boolean
  ) => string | null
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
  updateMediaGroupCaption: (blockId: string, caption: string) => void
  removeImageAfterBlock: (blockId: string) => void
  removeImgPairAfterBlock: (blockId: string) => void
  removeImgTrioAfterBlock: (blockId: string) => void
  mergeWithNextBlock: (blockId: string) => void
  resetToOriginalBlocks: () => void
  findHeaderSplitPoints: (content: string) => { lineIndex: number; headerText: string }[]
  splitBlockAtHeader: (blockId: string, lineIndex: number) => void
  addNewBlock: (afterBlockId?: string) => void
  addNewEditorialBlock: (component: SupportedEditorialComponent, afterBlockId?: string) => void
  deleteBlock: (blockId: string) => void
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  handleDelete: () => void
  isConverting: boolean
  isPublishing: boolean
  publishResult: PublishResult
  setPublishResult: Dispatch<SetStateAction<PublishResult>>
  openImagePickerTarget: string | null
  openEditorialPickerTarget: string | null
  toggleImagePicker: (target: string) => void
  toggleEditorialPicker: (target: string) => void
  showImageModal: boolean
  setShowImageModalTracked: Dispatch<SetStateAction<boolean>>
  featuredImageUploadExternalRef: string
  featuredImageFileNamePrefix: string
  featuredImageSource: ImageSourceOption
  setFeaturedImageSource: Dispatch<SetStateAction<ImageSourceOption>>
  imageSearch: string
  setImageSearch: Dispatch<SetStateAction<string>>
  unsplashFeaturedQuery: string
  setUnsplashFeaturedQuery: Dispatch<SetStateAction<string>>
  unsplashFeaturedResults: UnsplashPhoto[]
  isSearchingUnsplashFeatured: boolean
  unsplashFeaturedError: string | null
  unsplashFeaturedOrientation: PexelsOrientationOption
  setUnsplashFeaturedOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  unsplashFeaturedPerPage: number
  setUnsplashFeaturedPerPage: Dispatch<SetStateAction<number>>
  pexelsFeaturedQuery: string
  setPexelsFeaturedQuery: Dispatch<SetStateAction<string>>
  pexelsFeaturedResults: PexelsPhoto[]
  isSearchingPexelsFeatured: boolean
  pexelsFeaturedError: string | null
  pexelsFeaturedOrientation: PexelsOrientationOption
  setPexelsFeaturedOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  pexelsFeaturedPerPage: number
  setPexelsFeaturedPerPage: Dispatch<SetStateAction<number>>
  isImportingFeaturedExternalImage: boolean
  runFeaturedUnsplashSearch: () => Promise<void>
  runFeaturedPexelsSearch: () => Promise<void>
  blockImageModal: BlockImageModalState | null
  blockImageSource: ImageSourceOption
  setBlockImageSource: Dispatch<SetStateAction<ImageSourceOption>>
  blockImageSearch: string
  setBlockImageSearch: Dispatch<SetStateAction<string>>
  imgBlockAssets: MediaAsset[]
  isLoadingImgBlockAssets: boolean
  imgBlockAssetsError: string | null
  hasMoreImgBlockAssets: boolean
  loadMoreImgBlockAssets: () => Promise<void>
  selectedImgBlockAssetIds: number[]
  toggleImgBlockAssetSelection: (assetId: number, requiredCount: number) => void
  imgBlockCaption: string
  setImgBlockCaption: Dispatch<SetStateAction<string>>
  imgTrioFormat: ImgTrioFormat
  setImgTrioFormat: Dispatch<SetStateAction<ImgTrioFormat>>
  unsplashBlockQuery: string
  setUnsplashBlockQuery: Dispatch<SetStateAction<string>>
  unsplashBlockResults: UnsplashPhoto[]
  isSearchingUnsplashBlock: boolean
  unsplashBlockError: string | null
  unsplashBlockOrientation: PexelsOrientationOption
  setUnsplashBlockOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  unsplashBlockPerPage: number
  setUnsplashBlockPerPage: Dispatch<SetStateAction<number>>
  pexelsBlockQuery: string
  setPexelsBlockQuery: Dispatch<SetStateAction<string>>
  pexelsBlockResults: PexelsPhoto[]
  isSearchingPexelsBlock: boolean
  pexelsBlockError: string | null
  pexelsBlockOrientation: PexelsOrientationOption
  setPexelsBlockOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  pexelsBlockPerPage: number
  setPexelsBlockPerPage: Dispatch<SetStateAction<number>>
  openBlockImageModalTracked: (
    blockId: string,
    mode: BlockImageModalState['mode'],
    options?: OpenBlockImageModalOptions
  ) => void
  closeBlockImageModalTracked: () => void
  isImportingBlockExternalImage: boolean
  runBlockUnsplashSearch: () => Promise<void>
  runBlockPexelsSearch: () => Promise<void>
  mergeMediaAssetsIntoState: (newAssets: MediaAsset[]) => void
  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
  handlePublish: (targetStatus: 'draft' | 'published') => void
}

type UseEditorialStageLoadedArticleViewsResult = {
  layout: EditorialStageLayoutView
  timelineListProps: TimelineListViewProps
  sidebarProps: SidebarViewProps
  featuredModalProps: FeaturedModalViewProps
  blockModalProps: BlockModalViewProps
}

export function useEditorialStageLoadedArticleViews(
  params: UseEditorialStageLoadedArticleViewsParams
): UseEditorialStageLoadedArticleViewsResult {
  const {
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
  } = useEditorialStageDerivedState({
    stagedArticle: params.stagedArticle,
    locations: params.locations,
    mediaAssets: params.mediaAssets,
    timelineItems: params.timelineItems,
    editorialPublishAnalysis: params.editorialPublishAnalysis,
    imageSearch: params.imageSearch,
    blockImageModal: params.blockImageModal,
    blockImageSearch: params.blockImageSearch,
    imgBlockAssets: params.imgBlockAssets,
    selectedImgBlockAssetIds: params.selectedImgBlockAssetIds,
    imgTrioFormat: params.imgTrioFormat,
    findPreferredVariantAsset: params.findPreferredVariantAsset,
  })

  const blockImageExternalRef = params.blockImageModal
    ? `${params.stagedArticle.id}_block_${params.blockImageModal.blockId}`
    : ''
  const blockImageFileNamePrefix = blockImageExternalRef
    ? buildImageFileNamePrefix(params.stagedArticle.title, blockImageExternalRef)
    : undefined

  const selectedImgBlockAssetsCount = selectedImgBlockAssets.length

  const handleAddSelectedImgBlock = useEditorialStageImageBlockAction({
    blockImageModal: params.blockImageModal,
    requiredImageCount,
    imgTrioFormat: params.imgTrioFormat,
    imgBlockCaption: params.imgBlockCaption,
    addImgPairAfterBlock: params.addImgPairAfterBlock,
    addImgTrioAfterBlock: params.addImgTrioAfterBlock,
    mergeMediaAssetsIntoState: params.mergeMediaAssetsIntoState,
    closeBlockImageModal: params.closeBlockImageModalTracked,
    setPublishResult: params.setPublishResult,
  })

  const getImageUrl = getMediaAssetUrl

  const timelineListProps = buildTimelineListView({
    stagedArticle: params.stagedArticle,
    activeEditingTimelineItemId: params.activeEditingTimelineItemId,
    totalTechnicalBlockCount,
    timelineItems: params.timelineItems,
    timelineIndexMap,
    editorialBlockById,
    contentBlockById,
    contentBlockIndexMap,
    contentTimelineNumberMap,
    editorialTimelineNumberMap,
    imageTimelineNumberMap,
    lastContentBlock,
    draggedTimelineItemId: params.draggedTimelineItemId,
    dragOverTimelineItemId: params.dragOverTimelineItemId,
    handleDragStart: params.handleDragStart,
    handleDragEnd: params.handleDragEnd,
    handleDragOver: params.handleDragOver,
    handleDragLeave: params.handleDragLeave,
    handleDrop: params.handleDrop,
    moveTimelineItem: params.moveTimelineItem,
    editorialPublishAnalysis: params.editorialPublishAnalysis,
    fixEditorialBlock: params.fixEditorialBlock,
    updateEditorialBlockMarkdown: params.updateEditorialBlockMarkdown,
    removeEditorialBlock: params.removeEditorialBlock,
    openImagePickerTarget: params.openImagePickerTarget,
    openEditorialPickerTarget: params.openEditorialPickerTarget,
    toggleImagePicker: params.toggleImagePicker,
    toggleEditorialPicker: params.toggleEditorialPicker,
    openBlockImageModal: params.openBlockImageModalTracked,
    addEditorialFromPicker: (component, afterBlockId, placeAfterImage) => {
      void placeAfterImage
      params.addNewEditorialBlock(component, afterBlockId)
    },
    addNewBlock: params.addNewBlock,
    mergeWithNextBlock: params.mergeWithNextBlock,
    toggleTimelineItemEdit: params.toggleTimelineItemEdit,
    deleteBlock: params.deleteBlock,
    updateBlockContent: params.updateBlockContent,
    rewriteTextBlockWithAi: params.rewriteTextBlockWithAi,
    findHeaderSplitPoints: params.findHeaderSplitPoints,
    splitBlockAtHeader: params.splitBlockAtHeader,
    mediaAssets: params.mediaAssets,
    getImageUrl,
    updateMediaGroupCaption: params.updateMediaGroupCaption,
    removeImgTrioAfterBlock: params.removeImgTrioAfterBlock,
    removeImgPairAfterBlock: params.removeImgPairAfterBlock,
    removeImageAfterBlock: params.removeImageAfterBlock,
  })

  const sidebarProps = buildSidebarView({
    stagedArticle: params.stagedArticle,
    isPublishing: params.isPublishing,
    allFieldsFilled,
    missingPublishFields,
    editorialBlockingMessages,
    publishResult: params.publishResult,
    featuredImageRequirementLabel,
    selectedFeaturedImage,
    getImageUrl,
    setShowImageModal: params.setShowImageModalTracked,
    locations: params.locations,
    updateStagedArticle: params.updateStagedArticle,
    onPublish: params.handlePublish,
  })

  const featuredModalProps = buildFeaturedModalView({
    showImageModal: params.showImageModal,
    stagedArticle: params.stagedArticle,
    featuredImageRequirementLabel,
    selectedLocation,
    token: params.token || undefined,
    updateStagedArticle: params.updateStagedArticle,
    setShowImageModal: params.setShowImageModalTracked,
  })

  const blockModalProps = buildBlockModalView({
    stagedArticle: params.stagedArticle,
    blockImageModal: params.blockImageModal,
    closeBlockImageModal: params.closeBlockImageModalTracked,
    token: params.token || undefined,
    selectedLocation,
    singleImageRequirementLabel,
    imgPairRequirementLabel,
    imgTrioRequirementLabel,
    imgTrioFormat: params.imgTrioFormat,
    setImgTrioFormat: params.setImgTrioFormat,
    imgBlockCaption: params.imgBlockCaption,
    setImgBlockCaption: params.setImgBlockCaption,
    addImageAfterBlock: params.addImageAfterBlock,
    setActiveEditingTimelineItemId: params.setActiveEditingTimelineItemId,
    getImageTimelineItemId,
    mergeMediaAssetsIntoState: params.mergeMediaAssetsIntoState,
    setPublishResult: params.setPublishResult,
    handleAddSelectedImgBlock,
  })

  const layout: EditorialStageLayoutView = {
    stagedArticle: params.stagedArticle,
    stagePath: params.stagePath,
    hasMissingFeaturedImage,
    isConverting: params.isConverting,
    onResetToOriginalBlocks: params.resetToOriginalBlocks,
    onDelete: params.handleDelete,
    onUpdateTitle: (title: string) => params.updateStagedArticle({ title }),
  }

  return {
    layout,
    timelineListProps,
    sidebarProps,
    featuredModalProps,
    blockModalProps,
  }
}
