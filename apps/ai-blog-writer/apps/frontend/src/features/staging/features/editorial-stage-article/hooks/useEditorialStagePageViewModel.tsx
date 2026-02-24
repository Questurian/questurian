import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Location, MediaAsset, PexelsPhoto, UnsplashPhoto } from '../../../api'
import type { StagedArticle } from '../../../types'
import type {
  BlockImageModalState,
  ExternalImageCropContext,
  ExternalImageCropDraft,
  ImageSourceOption,
  ImgTrioFormat,
  MediaVariant,
  PexelsOrientationOption,
} from '../types'
import { ExternalImageCropEditor } from '../../../components/editorial-stage/ExternalImageCropEditor'

type PublishResult = { success: boolean; message: string } | null

type UseEditorialStagePageViewModelParams = {
  stagedArticle: StagedArticle
  locations: Location[]
  selectedLocation?: Location
  selectedFeaturedImage: MediaAsset | null
  allFieldsFilled: boolean
  hasMissingFeaturedImage: boolean
  isPublishing: boolean
  publishResult: PublishResult
  updateStagedArticle: (updates: Partial<StagedArticle>) => void

  totalTechnicalBlockCount: number
  activeEditingTimelineItemId: string | null
  timelineItems: any[]
  timelineIndexMap: Map<string, number>
  editorialBlockById: Map<string, any>
  contentBlockById: Map<string, any>
  contentBlockIndexMap: Map<string, number>
  contentTimelineNumberMap: Map<string, number>
  editorialTimelineNumberMap: Map<string, number>
  imageTimelineNumberMap: Map<string, number>
  lastContentBlock: any

  draggedTimelineItemId: string | null
  dragOverTimelineItemId: string | null
  handleDragStart: (e: React.DragEvent, timelineItemId: string) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent, timelineItemId: string) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent, targetTimelineItemId: string) => void
  moveTimelineItem: (timelineItemId: string, direction: 'up' | 'down') => void

  editorialPublishAnalysis: { byId: Record<string, any> }
  fixEditorialBlock: (blockId: string) => void
  updateEditorialBlockMarkdown: (blockId: string, nextMarkdown: string) => void
  removeEditorialBlock: (blockId: string) => void

  openImagePickerTarget: string | null
  openEditorialPickerTarget: string | null
  toggleImagePicker: (target: string) => void
  toggleEditorialPicker: (target: string) => void
  openBlockImageModal: (blockId: string, mode: any, options?: any) => void
  addEditorialFromPicker: (component: any, afterBlockId?: string, placeAfterImage?: boolean) => void
  addNewBlock: (afterBlockId?: string) => void
  mergeWithNextBlock: (blockId: string) => void

  toggleTimelineItemEdit: (timelineItemId: string) => void
  deleteBlock: (blockId: string) => void
  updateBlockContent: (blockId: string, newContent: string) => void
  rewriteTextBlockWithAi: (
    blockId: string,
    currentContent: string,
    prompt: string,
    includeWholeArticleContext: boolean
  ) => Promise<string>
  findHeaderSplitPoints: (content: string) => { lineIndex: number; headerText: string }[]
  splitBlockAtHeader: (blockId: string, lineIndex: number) => void

  mediaAssets: MediaAsset[]
  getImageUrl: (asset: MediaAsset) => string
  updateMediaGroupCaption: (blockId: string, caption: string) => void
  removeImgTrioAfterBlock: (blockId: string) => void
  removeImgPairAfterBlock: (blockId: string) => void
  removeImageAfterBlock: (blockId: string) => void

  // Featured modal
  showImageModal: boolean
  setShowImageModal: Dispatch<SetStateAction<boolean>>
  featuredImageRequirementLabel: string
  featuredImageSource: ImageSourceOption
  setFeaturedImageSource: Dispatch<SetStateAction<ImageSourceOption>>
  imageSearch: string
  setImageSearch: Dispatch<SetStateAction<string>>
  filteredFeaturedImageAssets: MediaAsset[]
  imageAltText: string
  imagePhotographerCredit: string
  setImageAltText: Dispatch<SetStateAction<string>>
  setImagePhotographerCredit: Dispatch<SetStateAction<string>>
  handleUploadComplete: (result: any) => void
  unsplashFeaturedQuery: string
  setUnsplashFeaturedQuery: Dispatch<SetStateAction<string>>
  unsplashFeaturedOrientation: PexelsOrientationOption
  setUnsplashFeaturedOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  unsplashFeaturedPerPage: number
  setUnsplashFeaturedPerPage: Dispatch<SetStateAction<number>>
  runFeaturedUnsplashSearch: () => Promise<void>
  isSearchingUnsplashFeatured: boolean
  unsplashFeaturedError: string | null
  unsplashFeaturedResults: UnsplashPhoto[]
  isImportingFeaturedExternalImage: boolean
  handleImportFeaturedExternalImage: (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: 'unsplash' | 'pexels'
  ) => Promise<void>
  pexelsFeaturedQuery: string
  setPexelsFeaturedQuery: Dispatch<SetStateAction<string>>
  pexelsFeaturedOrientation: PexelsOrientationOption
  setPexelsFeaturedOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  pexelsFeaturedPerPage: number
  setPexelsFeaturedPerPage: Dispatch<SetStateAction<number>>
  runFeaturedPexelsSearch: () => Promise<void>
  isSearchingPexelsFeatured: boolean
  pexelsFeaturedError: string | null
  pexelsFeaturedResults: PexelsPhoto[]

  // Block modal
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
  filteredBlockImageAssets: MediaAsset[]
  selectedImgBlockAssetIds: number[]
  toggleImgBlockAssetSelection: (assetId: number, requiredCount: number) => void
  requiredImageCount: number
  selectedImgBlockAssetsCount: number
  handleAddSelectedImgBlock: () => void
  imgTrioDimensions: { width: number; height: number }
  blockImageExternalRef: string
  blockImageFileNamePrefix?: string
  token?: string
  blockImageAltText: string
  blockImagePhotographerCredit: string
  setBlockImageAltText: Dispatch<SetStateAction<string>>
  setBlockImagePhotographerCredit: Dispatch<SetStateAction<string>>
  handleBlockImageUploadComplete: (result: any) => void
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

  // Shared/external
  externalImageCropDraft: ExternalImageCropDraft | null
  setExternalImageCropDraft: Dispatch<SetStateAction<ExternalImageCropDraft | null>>
  externalImageCropError: string | null
  setExternalImageCropError: Dispatch<SetStateAction<string | null>>
  externalImageUploadProgress: any
  setExternalImageUploadProgress: Dispatch<SetStateAction<any>>
  isUploadingExternalImageVariants: boolean
  setIsUploadingExternalImageVariants: Dispatch<SetStateAction<boolean>>
  handleSkipCropExternalImport: () => Promise<void>
  handleUploadExternalCroppedVariants: (variantFiles: Array<{ type: any; file: File }>) => Promise<void>

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
}

export function useEditorialStagePageViewModel(params: UseEditorialStagePageViewModelParams) {
  const renderExternalCropEditor = useCallback((context: ExternalImageCropContext) => (
    <ExternalImageCropEditor
      context={context}
      externalImageCropDraft={params.externalImageCropDraft}
      setExternalImageCropDraft={params.setExternalImageCropDraft}
      externalImageCropError={params.externalImageCropError}
      setExternalImageCropError={params.setExternalImageCropError}
      externalImageUploadProgress={params.externalImageUploadProgress}
      setExternalImageUploadProgress={params.setExternalImageUploadProgress}
      isUploadingExternalImageVariants={params.isUploadingExternalImageVariants}
      setIsUploadingExternalImageVariants={params.setIsUploadingExternalImageVariants}
      isImportingFeaturedExternalImage={params.isImportingFeaturedExternalImage}
      isImportingBlockExternalImage={params.isImportingBlockExternalImage}
      handleSkipCropExternalImport={params.handleSkipCropExternalImport}
      handleUploadExternalCroppedVariants={params.handleUploadExternalCroppedVariants}
    />
  ), [params])

  return {
    timelineList: {
      timeline: {
        stagedArticle: params.stagedArticle,
        activeEditingTimelineItemId: params.activeEditingTimelineItemId,
        totalTechnicalBlockCount: params.totalTechnicalBlockCount,
        timelineItems: params.timelineItems,
        timelineIndexMap: params.timelineIndexMap,
        editorialBlockById: params.editorialBlockById,
        contentBlockById: params.contentBlockById,
        contentBlockIndexMap: params.contentBlockIndexMap,
        contentTimelineNumberMap: params.contentTimelineNumberMap,
        editorialTimelineNumberMap: params.editorialTimelineNumberMap,
        imageTimelineNumberMap: params.imageTimelineNumberMap,
        lastContentBlock: params.lastContentBlock,
      },
      drag: {
        draggedTimelineItemId: params.draggedTimelineItemId,
        dragOverTimelineItemId: params.dragOverTimelineItemId,
        handleDragStart: params.handleDragStart,
        handleDragEnd: params.handleDragEnd,
        handleDragOver: params.handleDragOver,
        handleDragLeave: params.handleDragLeave,
        handleDrop: params.handleDrop,
        moveTimelineItem: params.moveTimelineItem,
      },
      editorial: {
        editorialPublishAnalysis: params.editorialPublishAnalysis,
        fixEditorialBlock: params.fixEditorialBlock,
        updateEditorialBlockMarkdown: params.updateEditorialBlockMarkdown,
        removeEditorialBlock: params.removeEditorialBlock,
      },
      picker: {
        openImagePickerTarget: params.openImagePickerTarget,
        openEditorialPickerTarget: params.openEditorialPickerTarget,
        toggleImagePicker: params.toggleImagePicker,
        toggleEditorialPicker: params.toggleEditorialPicker,
        openBlockImageModal: params.openBlockImageModal,
        addEditorialFromPicker: params.addEditorialFromPicker,
        addNewBlock: params.addNewBlock,
        mergeWithNextBlock: params.mergeWithNextBlock,
      },
      content: {
        toggleTimelineItemEdit: params.toggleTimelineItemEdit,
        deleteBlock: params.deleteBlock,
        updateBlockContent: params.updateBlockContent,
        rewriteTextBlockWithAi: params.rewriteTextBlockWithAi,
        findHeaderSplitPoints: params.findHeaderSplitPoints,
        splitBlockAtHeader: params.splitBlockAtHeader,
      },
      media: {
        mediaAssets: params.mediaAssets,
        getImageUrl: params.getImageUrl,
        updateMediaGroupCaption: params.updateMediaGroupCaption,
        removeImgTrioAfterBlock: params.removeImgTrioAfterBlock,
        removeImgPairAfterBlock: params.removeImgPairAfterBlock,
        removeImageAfterBlock: params.removeImageAfterBlock,
      },
    },
    sidebar: {
      stagedArticle: params.stagedArticle,
      isPublishing: params.isPublishing,
      allFieldsFilled: params.allFieldsFilled,
      publishResult: params.publishResult,
      featuredImageRequirementLabel: params.featuredImageRequirementLabel,
      selectedFeaturedImage: params.selectedFeaturedImage,
      getImageUrl: params.getImageUrl,
      onOpenFeaturedImageModal: () => params.setShowImageModal(true),
      locations: params.locations,
      onUpdateStagedArticle: params.updateStagedArticle,
    },
    featuredModal: {
      base: {
        show: params.showImageModal,
        publishedToPayload: params.stagedArticle.publishedToPayload,
        onClose: () => params.setShowImageModal(false),
        featuredImageRequirementLabel: params.featuredImageRequirementLabel,
      },
      payload: {
        featuredImageSource: params.featuredImageSource,
        imageSearch: params.imageSearch,
        setImageSearch: params.setImageSearch,
        filteredFeaturedImageAssets: params.filteredFeaturedImageAssets,
        selectedFeaturedImage: params.selectedFeaturedImage,
      },
      upload: {
        selectedLocation: params.selectedLocation,
        stagedArticleId: params.stagedArticle.id,
        featuredImageFileNamePrefix: params.featuredImageFileNamePrefix,
        token: params.token,
        imageAltText: params.imageAltText,
        imagePhotographerCredit: params.imagePhotographerCredit,
        setImageAltText: params.setImageAltText,
        setImagePhotographerCredit: params.setImagePhotographerCredit,
        handleUploadComplete: params.handleUploadComplete,
      },
      external: {
        externalImageCropDraft: params.externalImageCropDraft,
        renderExternalCropEditor,
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
      },
      actions: {
        setFeaturedImageSource: params.setFeaturedImageSource,
        findPreferredVariantAsset: params.findPreferredVariantAsset,
        updateStagedArticle: params.updateStagedArticle,
        getImageUrl: params.getImageUrl,
      },
    },
    blockModal: {
      base: {
        show: Boolean(params.blockImageModal?.show),
        publishedToPayload: params.stagedArticle.publishedToPayload,
        onClose: params.closeBlockImageModal,
        blockImageModal: params.blockImageModal,
        isImgBlockModal: params.isImgBlockModal,
        isImgTrioModal: params.isImgTrioModal,
        isMultiImageModal: params.isMultiImageModal,
        singleImageRequirementLabel: params.singleImageRequirementLabel,
        imgPairRequirementLabel: params.imgPairRequirementLabel,
        imgTrioRequirementLabel: params.imgTrioRequirementLabel,
        activeBlockImageRequirementLabel: params.activeBlockImageRequirementLabel,
      },
      payload: {
        blockImageSource: params.blockImageSource,
        imgTrioFormat: params.imgTrioFormat,
        setImgTrioFormat: params.setImgTrioFormat,
        imgBlockCaption: params.imgBlockCaption,
        setImgBlockCaption: params.setImgBlockCaption,
        blockImageSearch: params.blockImageSearch,
        setBlockImageSearch: params.setBlockImageSearch,
        isLoadingImgBlockAssets: params.isLoadingImgBlockAssets,
        imgBlockAssetsError: params.imgBlockAssetsError,
        filteredBlockImageAssets: params.filteredBlockImageAssets,
        selectedImgBlockAssetIds: params.selectedImgBlockAssetIds,
        toggleImgBlockAssetSelection: params.toggleImgBlockAssetSelection,
        requiredImageCount: params.requiredImageCount,
        selectedImgBlockAssetsCount: params.selectedImgBlockAssetsCount,
        handleAddSelectedImgBlock: params.handleAddSelectedImgBlock,
        imgTrioDimensions: params.imgTrioDimensions,
      },
      upload: {
        selectedLocation: params.selectedLocation,
        blockImageExternalRef: params.blockImageExternalRef,
        blockImageFileNamePrefix: params.blockImageFileNamePrefix,
        token: params.token,
        blockImageAltText: params.blockImageAltText,
        blockImagePhotographerCredit: params.blockImagePhotographerCredit,
        setBlockImageAltText: params.setBlockImageAltText,
        setBlockImagePhotographerCredit: params.setBlockImagePhotographerCredit,
        handleBlockImageUploadComplete: params.handleBlockImageUploadComplete,
      },
      external: {
        externalImageCropDraft: params.externalImageCropDraft,
        renderExternalCropEditor,
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
      },
      actions: {
        setBlockImageSource: params.setBlockImageSource,
        findPreferredVariantAsset: params.findPreferredVariantAsset,
        addImageAfterBlock: params.addImageAfterBlock,
        setPublishResult: params.setPublishResult,
        setActiveEditingTimelineItemId: params.setActiveEditingTimelineItemId,
        getImageTimelineItemId: params.getImageTimelineItemId,
        mergeMediaAssetsIntoState: params.mergeMediaAssetsIntoState,
        getImageUrl: params.getImageUrl,
      },
    },
  }
}
