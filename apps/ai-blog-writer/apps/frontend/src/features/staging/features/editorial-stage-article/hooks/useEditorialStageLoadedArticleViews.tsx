import { useMemo, type Dispatch, type SetStateAction } from 'react'
import type { StagedArticle } from '../../../types'
import type {
  ContentBlock,
  EditorialBlock,
} from '../../../types'
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
import type { UploadImageResponse } from '../../../../../features/images'
import type { PexelsPhoto, UnsplashPhoto } from '../../../api'
import type { EditorialPublishValidation } from '../editorial-markdown.service'

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
  editorialPublishAnalysis: { byId: Record<string, EditorialPublishValidation> }
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
  featuredImageSource: ImageSourceOption
  setFeaturedImageSource: Dispatch<SetStateAction<ImageSourceOption>>
  imageSearch: string
  setImageSearch: Dispatch<SetStateAction<string>>
  imageAltText: string
  setImageAltText: Dispatch<SetStateAction<string>>
  imagePhotographerCredit: string
  setImagePhotographerCredit: Dispatch<SetStateAction<string>>
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
  handleImportFeaturedExternalImage: (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: 'unsplash' | 'pexels'
  ) => Promise<void>
  handleUploadComplete: (result: UploadImageResponse) => void
  runFeaturedUnsplashSearch: () => Promise<void>
  runFeaturedPexelsSearch: () => Promise<void>
  blockImageModal: BlockImageModalState | null
  blockImageSource: ImageSourceOption
  setBlockImageSource: Dispatch<SetStateAction<ImageSourceOption>>
  blockImageSearch: string
  setBlockImageSearch: Dispatch<SetStateAction<string>>
  blockImageAltText: string
  setBlockImageAltText: Dispatch<SetStateAction<string>>
  blockImagePhotographerCredit: string
  setBlockImagePhotographerCredit: Dispatch<SetStateAction<string>>
  imgBlockAssets: MediaAsset[]
  isLoadingImgBlockAssets: boolean
  imgBlockAssetsError: string | null
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
  handleImportBlockExternalImage: (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: 'unsplash' | 'pexels'
  ) => Promise<void>
  handleBlockImageUploadComplete: (result: UploadImageResponse) => void
  runBlockUnsplashSearch: () => Promise<void>
  runBlockPexelsSearch: () => Promise<void>
  externalImageCropDraft: ExternalImageCropDraft | null
  renderExternalCropEditor: (context: 'featured' | 'block') => React.ReactNode
  isUploadingExternalImageVariants: boolean
  mergeMediaAssetsIntoState: (newAssets: MediaAsset[]) => void
  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
  handlePublish: () => void
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
    imageSearch: params.imageSearch,
    blockImageModal: params.blockImageModal,
    blockImageSearch: params.blockImageSearch,
    imgBlockAssets: params.imgBlockAssets,
    selectedImgBlockAssetIds: params.selectedImgBlockAssetIds,
    imgTrioFormat: params.imgTrioFormat,
    findPreferredVariantAsset: params.findPreferredVariantAsset,
  })

  const featuredImageFileNamePrefix = useMemo(() => buildImageFileNamePrefix(
    params.stagedArticle.title,
    params.stagedArticle.id
  ), [params.stagedArticle.title, params.stagedArticle.id])

  const blockImageExternalRef = params.blockImageModal
    ? `${params.stagedArticle.id}_block_${params.blockImageModal.blockId}`
    : ''
  const blockImageFileNamePrefix = blockImageExternalRef
    ? buildImageFileNamePrefix(params.stagedArticle.title, blockImageExternalRef)
    : undefined

  const selectedImgBlockAssetsCount = selectedImgBlockAssets.length

  const handleAddSelectedImgBlock = useEditorialStageImageBlockAction({
    blockImageModal: params.blockImageModal,
    selectedImgBlockAssets,
    requiredImageCount,
    findPreferredVariantAsset: params.findPreferredVariantAsset,
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
    featuredImageSource: params.featuredImageSource,
    setFeaturedImageSource: params.setFeaturedImageSource,
    imageSearch: params.imageSearch,
    setImageSearch: params.setImageSearch,
    filteredFeaturedImageAssets,
    selectedFeaturedImage,
    selectedLocation,
    featuredImageFileNamePrefix,
    token: params.token || undefined,
    imageAltText: params.imageAltText,
    imagePhotographerCredit: params.imagePhotographerCredit,
    setImageAltText: params.setImageAltText,
    setImagePhotographerCredit: params.setImagePhotographerCredit,
    handleUploadComplete: params.handleUploadComplete,
    externalImageCropDraft: params.externalImageCropDraft,
    renderExternalCropEditor: params.renderExternalCropEditor,
    unsplashFeaturedQuery: params.unsplashFeaturedQuery,
    setUnsplashFeaturedQuery: params.setUnsplashFeaturedQuery,
    unsplashFeaturedOrientation: params.unsplashFeaturedOrientation,
    setUnsplashFeaturedOrientation: params.setUnsplashFeaturedOrientation,
    unsplashFeaturedPerPage: params.unsplashFeaturedPerPage,
    setUnsplashFeaturedPerPage: params.setUnsplashFeaturedPerPage,
    runFeaturedUnsplashSearch: params.runFeaturedUnsplashSearch,
    isSearchingUnsplashFeatured: params.isSearchingUnsplashFeatured,
    unsplashFeaturedError: params.unsplashFeaturedError,
    unsplashFeaturedResults: params.unsplashFeaturedResults,
    isImportingFeaturedExternalImage: params.isImportingFeaturedExternalImage,
    handleImportFeaturedExternalImage: params.handleImportFeaturedExternalImage,
    pexelsFeaturedQuery: params.pexelsFeaturedQuery,
    setPexelsFeaturedQuery: params.setPexelsFeaturedQuery,
    pexelsFeaturedOrientation: params.pexelsFeaturedOrientation,
    setPexelsFeaturedOrientation: params.setPexelsFeaturedOrientation,
    pexelsFeaturedPerPage: params.pexelsFeaturedPerPage,
    setPexelsFeaturedPerPage: params.setPexelsFeaturedPerPage,
    runFeaturedPexelsSearch: params.runFeaturedPexelsSearch,
    isSearchingPexelsFeatured: params.isSearchingPexelsFeatured,
    pexelsFeaturedError: params.pexelsFeaturedError,
    pexelsFeaturedResults: params.pexelsFeaturedResults,
    findPreferredVariantAsset: params.findPreferredVariantAsset,
    updateStagedArticle: params.updateStagedArticle,
    getImageUrl,
    setShowImageModal: params.setShowImageModalTracked,
  })

  const blockModalProps = buildBlockModalView({
    stagedPublishedToPayload: params.stagedArticle.publishedToPayload,
    blockImageModal: params.blockImageModal,
    closeBlockImageModal: params.closeBlockImageModalTracked,
    blockImageSource: params.blockImageSource,
    setBlockImageSource: params.setBlockImageSource,
    isImgBlockModal,
    isImgTrioModal,
    isMultiImageModal,
    singleImageRequirementLabel,
    imgPairRequirementLabel,
    imgTrioRequirementLabel,
    activeBlockImageRequirementLabel,
    imgTrioFormat: params.imgTrioFormat,
    setImgTrioFormat: params.setImgTrioFormat,
    imgBlockCaption: params.imgBlockCaption,
    setImgBlockCaption: params.setImgBlockCaption,
    blockImageSearch: params.blockImageSearch,
    setBlockImageSearch: params.setBlockImageSearch,
    isLoadingImgBlockAssets: params.isLoadingImgBlockAssets,
    imgBlockAssetsError: params.imgBlockAssetsError,
    filteredBlockImageAssets,
    selectedImgBlockAssetIds: params.selectedImgBlockAssetIds,
    toggleImgBlockAssetSelection: params.toggleImgBlockAssetSelection,
    requiredImageCount,
    selectedImgBlockAssetsCount,
    handleAddSelectedImgBlock,
    imgTrioDimensions,
    selectedLocation,
    blockImageExternalRef,
    blockImageFileNamePrefix,
    token: params.token || undefined,
    blockImageAltText: params.blockImageAltText,
    blockImagePhotographerCredit: params.blockImagePhotographerCredit,
    setBlockImageAltText: params.setBlockImageAltText,
    setBlockImagePhotographerCredit: params.setBlockImagePhotographerCredit,
    handleBlockImageUploadComplete: params.handleBlockImageUploadComplete,
    externalImageCropDraft: params.externalImageCropDraft,
    renderExternalCropEditor: params.renderExternalCropEditor,
    unsplashBlockQuery: params.unsplashBlockQuery,
    setUnsplashBlockQuery: params.setUnsplashBlockQuery,
    unsplashBlockOrientation: params.unsplashBlockOrientation,
    setUnsplashBlockOrientation: params.setUnsplashBlockOrientation,
    unsplashBlockPerPage: params.unsplashBlockPerPage,
    setUnsplashBlockPerPage: params.setUnsplashBlockPerPage,
    runBlockUnsplashSearch: params.runBlockUnsplashSearch,
    isSearchingUnsplashBlock: params.isSearchingUnsplashBlock,
    unsplashBlockError: params.unsplashBlockError,
    unsplashBlockResults: params.unsplashBlockResults,
    isImportingBlockExternalImage: params.isImportingBlockExternalImage,
    handleImportBlockExternalImage: params.handleImportBlockExternalImage,
    pexelsBlockQuery: params.pexelsBlockQuery,
    setPexelsBlockQuery: params.setPexelsBlockQuery,
    pexelsBlockOrientation: params.pexelsBlockOrientation,
    setPexelsBlockOrientation: params.setPexelsBlockOrientation,
    pexelsBlockPerPage: params.pexelsBlockPerPage,
    setPexelsBlockPerPage: params.setPexelsBlockPerPage,
    runBlockPexelsSearch: params.runBlockPexelsSearch,
    isSearchingPexelsBlock: params.isSearchingPexelsBlock,
    pexelsBlockError: params.pexelsBlockError,
    pexelsBlockResults: params.pexelsBlockResults,
    isUploadingExternalImageVariants: params.isUploadingExternalImageVariants,
    findPreferredVariantAsset: params.findPreferredVariantAsset,
    addImageAfterBlock: params.addImageAfterBlock,
    setPublishResult: params.setPublishResult,
    setActiveEditingTimelineItemId: params.setActiveEditingTimelineItemId,
    getImageTimelineItemId,
    mergeMediaAssetsIntoState: params.mergeMediaAssetsIntoState,
    getImageUrl,
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
