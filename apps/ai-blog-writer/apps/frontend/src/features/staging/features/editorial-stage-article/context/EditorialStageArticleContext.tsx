import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { StagedArticle } from '../../../types'
import type {
  ExternalImageCropContext,
  EditorialStageArticlePageProps,
  SupportedEditorialComponent,
} from '../types'
import {
  buildImageFileNamePrefix,
} from '../media-utils'
import {
  buildEditorialPublishAnalysis,
} from '../editorial-markdown.service'
import {
  getImageTimelineItemId,
} from '../workflow.service'
import { useEditorialStageDerivedState } from '../hooks/useEditorialStageDerivedState'
import { useEditorialStageTimeline } from '../hooks/useEditorialStageTimeline'
import { useEditorialStageBlocks } from '../hooks/useEditorialStageBlocks'
import { useEditorialStagePageData } from '../hooks/useEditorialStagePageData'
import { useEditorialStageMedia } from '../hooks/useEditorialStageMedia'
import { useEditorialStageImageBlockAction } from '../hooks/useEditorialStageImageBlockAction'
import { useEditorialStagePublishWorkflow } from '../hooks/useEditorialStagePublishWorkflow'
import { getMediaAssetUrl } from '../utils/editorial-stage-view.utils'
import { ExternalImageCropEditor } from '../../../components/editorial-stage/ExternalImageCropEditor'
import {
  buildBlockModalView,
  buildFeaturedModalView,
  buildSidebarView,
  buildTimelineListView,
  type BlockModalViewProps,
  type FeaturedModalViewProps,
  type SidebarViewProps,
  type TimelineListViewProps,
} from '../selectors'
import {
  createInitialEditorialStageUiState,
  editorialStageUiReducer,
  type PublishResult,
} from '../state/editorialStageUiMachine'

type EditorialStageArticleProviderProps = EditorialStageArticlePageProps & {
  token: string | null | undefined
  children: ReactNode
}

type EditorialStageLayoutView = {
  stagedArticle: StagedArticle
  stagePath: string
  hasMissingFeaturedImage: boolean
  isConverting: boolean
  onResetToOriginalBlocks: () => void
  onDelete: () => void
  onUpdateTitle: (title: string) => void
}

type EditorialStageStatusView = {
  isLoading: boolean
  error: string | null
  stagedArticle: StagedArticle | null
  articlesPath: string
}

type EditorialStageArticleContextValue = {
  status: EditorialStageStatusView
  layout: EditorialStageLayoutView | null
  timelineListProps: TimelineListViewProps | null
  sidebarProps: SidebarViewProps | null
  featuredModalProps: FeaturedModalViewProps | null
  blockModalProps: BlockModalViewProps | null
}

const EditorialStageArticleContext = createContext<EditorialStageArticleContextValue | null>(null)

function useSetPublishResult(
  currentResult: PublishResult,
  dispatchUi: (event: { type: 'SET_PUBLISH_RESULT'; result: PublishResult }) => void
): Dispatch<SetStateAction<PublishResult>> {
  return useCallback((next) => {
    const result = typeof next === 'function'
      ? next(currentResult)
      : next
    dispatchUi({ type: 'SET_PUBLISH_RESULT', result })
  }, [currentResult, dispatchUi])
}

export function EditorialStageArticleProvider({
  storageKey,
  routes,
  api,
  token,
  children,
}: EditorialStageArticleProviderProps) {
  const {
    fetchLocations,
    fetchMediaAssets,
    createArticle,
    convertMarkdownToLexical,
    fetchResult,
    markArticleSynced,
    fetchExternalImageSource,
    importExternalImage,
    searchPexelsImages,
    searchUnsplashImages,
    rewriteBlockWithAi,
  } = api

  const [uiState, dispatchUi] = useReducer(editorialStageUiReducer, undefined, createInitialEditorialStageUiState)
  const setPublishResult = useSetPublishResult(uiState.publishResult, dispatchUi)

  const {
    locations,
    mediaAssets,
    isLoading,
    error,
    stagedArticle,
    updateStagedArticle,
    handleDelete,
    mergeMediaAssetsIntoState,
  } = useEditorialStagePageData({
    storageKey,
    stageArticlePath: routes.stageArticlePath,
    stagePath: routes.stagePath,
    token,
    api: {
      fetchResult,
      fetchLocations,
      fetchMediaAssets,
    },
  })

  const {
    activeEditingTimelineItemId,
    setActiveEditingTimelineItemId,
    timelineItems,
    toggleTimelineItemEdit,
    moveTimelineItem,
    draggedTimelineItemId,
    dragOverTimelineItemId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useEditorialStageTimeline({
    stagedArticle,
    updateStagedArticle,
  })

  const editorialPublishAnalysis = useMemo(
    () => buildEditorialPublishAnalysis(stagedArticle?.editorialBlocks || []),
    [stagedArticle?.editorialBlocks]
  )

  const {
    fixEditorialBlock,
    updateEditorialBlockMarkdown,
    removeEditorialBlock,
    updateBlockContent,
    rewriteTextBlockWithAi,
    addImageAfterBlock,
    addImgPairAfterBlock,
    addImgTrioAfterBlock,
    updateMediaGroupCaption,
    removeImageAfterBlock,
    removeImgPairAfterBlock,
    removeImgTrioAfterBlock,
    mergeWithNextBlock,
    resetToOriginalBlocks,
    findHeaderSplitPoints,
    splitBlockAtHeader,
    addNewBlock,
    addNewEditorialBlock,
    deleteBlock,
  } = useEditorialStageBlocks({
    stagedArticle,
    timelineItems,
    updateStagedArticle,
    setPublishResult,
    setActiveEditingTimelineItemId,
    rewriteBlockWithAi,
  })

  const toggleEditorialPicker = useCallback((target: string) => {
    dispatchUi({ type: 'TOGGLE_EDITORIAL_PICKER', target })
  }, [])

  const toggleImagePicker = useCallback((target: string) => {
    dispatchUi({ type: 'TOGGLE_IMAGE_PICKER', target })
  }, [])

  const addEditorialFromPicker = useCallback((
    component: SupportedEditorialComponent,
    afterBlockId?: string,
    placeAfterImage?: boolean
  ) => {
    void placeAfterImage
    addNewEditorialBlock(component, afterBlockId)
    dispatchUi({ type: 'CLOSE_EDITORIAL_PICKER' })
  }, [addNewEditorialBlock])

  const {
    featured: {
      showImageModal,
      setShowImageModal,
      featuredImageSource,
      setFeaturedImageSource,
      imageSearch,
      setImageSearch,
      imageAltText,
      setImageAltText,
      imagePhotographerCredit,
      setImagePhotographerCredit,
      unsplashFeaturedQuery,
      setUnsplashFeaturedQuery,
      unsplashFeaturedResults,
      isSearchingUnsplashFeatured,
      unsplashFeaturedError,
      unsplashFeaturedOrientation,
      setUnsplashFeaturedOrientation,
      unsplashFeaturedPerPage,
      setUnsplashFeaturedPerPage,
      pexelsFeaturedQuery,
      setPexelsFeaturedQuery,
      pexelsFeaturedResults,
      isSearchingPexelsFeatured,
      pexelsFeaturedError,
      pexelsFeaturedOrientation,
      setPexelsFeaturedOrientation,
      pexelsFeaturedPerPage,
      setPexelsFeaturedPerPage,
      isImportingFeaturedExternalImage,
      handleImportFeaturedExternalImage,
      handleUploadComplete,
      runFeaturedUnsplashSearch,
      runFeaturedPexelsSearch,
    },
    block: {
      blockImageModal,
      blockImageSource,
      setBlockImageSource,
      blockImageSearch,
      setBlockImageSearch,
      blockImageAltText,
      setBlockImageAltText,
      blockImagePhotographerCredit,
      setBlockImagePhotographerCredit,
      imgBlockAssets,
      isLoadingImgBlockAssets,
      imgBlockAssetsError,
      selectedImgBlockAssetIds,
      toggleImgBlockAssetSelection,
      imgBlockCaption,
      setImgBlockCaption,
      imgTrioFormat,
      setImgTrioFormat,
      unsplashBlockQuery,
      setUnsplashBlockQuery,
      unsplashBlockResults,
      isSearchingUnsplashBlock,
      unsplashBlockError,
      unsplashBlockOrientation,
      setUnsplashBlockOrientation,
      unsplashBlockPerPage,
      setUnsplashBlockPerPage,
      pexelsBlockQuery,
      setPexelsBlockQuery,
      pexelsBlockResults,
      isSearchingPexelsBlock,
      pexelsBlockError,
      pexelsBlockOrientation,
      setPexelsBlockOrientation,
      pexelsBlockPerPage,
      setPexelsBlockPerPage,
      openBlockImageModal,
      closeBlockImageModal,
      isImportingBlockExternalImage,
      handleImportBlockExternalImage,
      handleBlockImageUploadComplete,
      runBlockUnsplashSearch,
      runBlockPexelsSearch,
    },
    externalImport: {
      externalImageCropDraft,
      setExternalImageCropDraft,
      externalImageCropError,
      setExternalImageCropError,
      externalImageUploadProgress,
      setExternalImageUploadProgress,
      isUploadingExternalImageVariants,
      setIsUploadingExternalImageVariants,
      handleUploadExternalCroppedVariants,
      handleSkipCropExternalImport,
    },
    shared: {
      findPreferredVariantAsset,
    },
  } = useEditorialStageMedia({
    token,
    stagedArticle,
    locations,
    mediaAssets,
    fetchMediaAssets,
    fetchExternalImageSource,
    importExternalImage,
    searchPexelsImages,
    searchUnsplashImages,
    updateStagedArticle,
    setPublishResult,
    setActiveEditingTimelineItemId,
    getImageTimelineItemId,
    addImageAfterBlock,
    clearOpenImagePickerTarget: () => dispatchUi({ type: 'CLOSE_IMAGE_PICKER' }),
  })

  useEffect(() => {
    dispatchUi({
      type: 'SYNC_MODAL_FLAGS',
      featuredOpen: showImageModal,
      blockOpen: Boolean(blockImageModal?.show),
      cropOpen: Boolean(externalImageCropDraft),
    })
  }, [showImageModal, blockImageModal?.show, externalImageCropDraft, dispatchUi])

  const setShowImageModalTracked: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
    const resolved = typeof next === 'function'
      ? next(showImageModal)
      : next
    setShowImageModal(resolved)
  }, [showImageModal, setShowImageModal])

  const openBlockImageModalTracked = useCallback((
    blockId: string,
    mode: Parameters<typeof openBlockImageModal>[1],
    options?: Parameters<typeof openBlockImageModal>[2]
  ) => {
    openBlockImageModal(blockId, mode, options)
  }, [openBlockImageModal])

  const closeBlockImageModalTracked = useCallback(() => {
    closeBlockImageModal()
  }, [closeBlockImageModal])

  const renderExternalCropEditor = useCallback((context: ExternalImageCropContext) => (
    <ExternalImageCropEditor
      context={context}
      externalImageCropDraft={externalImageCropDraft}
      setExternalImageCropDraft={setExternalImageCropDraft}
      externalImageCropError={externalImageCropError}
      setExternalImageCropError={setExternalImageCropError}
      externalImageUploadProgress={externalImageUploadProgress}
      setExternalImageUploadProgress={setExternalImageUploadProgress}
      isUploadingExternalImageVariants={isUploadingExternalImageVariants}
      setIsUploadingExternalImageVariants={setIsUploadingExternalImageVariants}
      isImportingFeaturedExternalImage={isImportingFeaturedExternalImage}
      isImportingBlockExternalImage={isImportingBlockExternalImage}
      handleSkipCropExternalImport={handleSkipCropExternalImport}
      handleUploadExternalCroppedVariants={handleUploadExternalCroppedVariants}
    />
  ), [
    externalImageCropDraft,
    setExternalImageCropDraft,
    externalImageCropError,
    setExternalImageCropError,
    externalImageUploadProgress,
    setExternalImageUploadProgress,
    isUploadingExternalImageVariants,
    setIsUploadingExternalImageVariants,
    isImportingFeaturedExternalImage,
    isImportingBlockExternalImage,
    handleSkipCropExternalImport,
    handleUploadExternalCroppedVariants,
  ])

  const {
    handlePublish,
    isPublishing,
    isConverting,
    publishResult,
  } = useEditorialStagePublishWorkflow({
    token,
    stagedArticle,
    locations,
    mediaAssets,
    timelineItems,
    editorialPublishAnalysis,
    convertMarkdownToLexical,
    createArticle,
    markArticleSynced,
    findPreferredVariantAsset,
    updateStagedArticle,
    dispatchUi,
    publishPhase: uiState.publishPhase,
    publishResult: uiState.publishResult,
  })

  const status: EditorialStageStatusView = useMemo(() => ({
    isLoading,
    error,
    stagedArticle,
    articlesPath: routes.articlesPath,
  }), [isLoading, error, stagedArticle, routes.articlesPath])

  if (isLoading || !stagedArticle) {
    return (
      <EditorialStageArticleContext.Provider
        value={{
          status,
          layout: null,
          timelineListProps: null,
          sidebarProps: null,
          featuredModalProps: null,
          blockModalProps: null,
        }}
      >
        {children}
      </EditorialStageArticleContext.Provider>
    )
  }

  if (error) {
    return (
      <EditorialStageArticleContext.Provider
        value={{
          status,
          layout: null,
          timelineListProps: null,
          sidebarProps: null,
          featuredModalProps: null,
          blockModalProps: null,
        }}
      >
        {children}
      </EditorialStageArticleContext.Provider>
    )
  }

  const getImageUrl = getMediaAssetUrl

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
    stagedArticle,
    locations,
    mediaAssets,
    timelineItems,
    imageSearch,
    blockImageModal,
    blockImageSearch,
    imgBlockAssets,
    selectedImgBlockAssetIds,
    imgTrioFormat,
    findPreferredVariantAsset,
  })

  const featuredImageFileNamePrefix = buildImageFileNamePrefix(
    stagedArticle.title,
    stagedArticle.id
  )
  const blockImageExternalRef = blockImageModal
    ? `${stagedArticle.id}_block_${blockImageModal.blockId}`
    : ''
  const blockImageFileNamePrefix = blockImageExternalRef
    ? buildImageFileNamePrefix(stagedArticle.title, blockImageExternalRef)
    : undefined

  const selectedImgBlockAssetsCount = selectedImgBlockAssets.length

  const handleAddSelectedImgBlock = useEditorialStageImageBlockAction({
    blockImageModal,
    selectedImgBlockAssets,
    requiredImageCount,
    findPreferredVariantAsset,
    imgTrioFormat,
    imgBlockCaption,
    addImgPairAfterBlock,
    addImgTrioAfterBlock,
    mergeMediaAssetsIntoState,
    closeBlockImageModal: closeBlockImageModalTracked,
    setPublishResult,
  })

  const timelineListProps = buildTimelineListView({
    stagedArticle,
    activeEditingTimelineItemId,
    totalTechnicalBlockCount,
    timelineItems,
    timelineIndexMap,
    editorialBlockById,
    contentBlockById,
    contentBlockIndexMap,
    contentTimelineNumberMap,
    editorialTimelineNumberMap,
    imageTimelineNumberMap,
    lastContentBlock,
    draggedTimelineItemId,
    dragOverTimelineItemId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    moveTimelineItem,
    editorialPublishAnalysis,
    fixEditorialBlock,
    updateEditorialBlockMarkdown,
    removeEditorialBlock,
    openImagePickerTarget: uiState.pickers.openImageTarget,
    openEditorialPickerTarget: uiState.pickers.openEditorialTarget,
    toggleImagePicker,
    toggleEditorialPicker,
    openBlockImageModal: openBlockImageModalTracked,
    addEditorialFromPicker,
    addNewBlock,
    mergeWithNextBlock,
    toggleTimelineItemEdit,
    deleteBlock,
    updateBlockContent,
    rewriteTextBlockWithAi,
    findHeaderSplitPoints,
    splitBlockAtHeader,
    mediaAssets,
    getImageUrl,
    updateMediaGroupCaption,
    removeImgTrioAfterBlock,
    removeImgPairAfterBlock,
    removeImageAfterBlock,
  })

  const sidebarProps = buildSidebarView({
    stagedArticle,
    isPublishing,
    allFieldsFilled,
    publishResult,
    featuredImageRequirementLabel,
    selectedFeaturedImage,
    getImageUrl,
    setShowImageModal: setShowImageModalTracked,
    locations,
    updateStagedArticle,
    onPublish: handlePublish,
  })

  const featuredModalProps = buildFeaturedModalView({
    showImageModal,
    stagedArticle,
    featuredImageRequirementLabel,
    featuredImageSource,
    setFeaturedImageSource,
    imageSearch,
    setImageSearch,
    filteredFeaturedImageAssets,
    selectedFeaturedImage,
    selectedLocation,
    featuredImageFileNamePrefix,
    token: token || undefined,
    imageAltText,
    imagePhotographerCredit,
    setImageAltText,
    setImagePhotographerCredit,
    handleUploadComplete,
    externalImageCropDraft,
    renderExternalCropEditor,
    unsplashFeaturedQuery,
    setUnsplashFeaturedQuery,
    unsplashFeaturedOrientation,
    setUnsplashFeaturedOrientation,
    unsplashFeaturedPerPage,
    setUnsplashFeaturedPerPage,
    runFeaturedUnsplashSearch,
    isSearchingUnsplashFeatured,
    unsplashFeaturedError,
    unsplashFeaturedResults,
    isImportingFeaturedExternalImage,
    handleImportFeaturedExternalImage,
    pexelsFeaturedQuery,
    setPexelsFeaturedQuery,
    pexelsFeaturedOrientation,
    setPexelsFeaturedOrientation,
    pexelsFeaturedPerPage,
    setPexelsFeaturedPerPage,
    runFeaturedPexelsSearch,
    isSearchingPexelsFeatured,
    pexelsFeaturedError,
    pexelsFeaturedResults,
    findPreferredVariantAsset,
    updateStagedArticle,
    getImageUrl,
    setShowImageModal: setShowImageModalTracked,
  })

  const blockModalProps = buildBlockModalView({
    stagedPublishedToPayload: stagedArticle.publishedToPayload,
    blockImageModal,
    closeBlockImageModal: closeBlockImageModalTracked,
    blockImageSource,
    setBlockImageSource,
    isImgBlockModal,
    isImgTrioModal,
    isMultiImageModal,
    singleImageRequirementLabel,
    imgPairRequirementLabel,
    imgTrioRequirementLabel,
    activeBlockImageRequirementLabel,
    imgTrioFormat,
    setImgTrioFormat,
    imgBlockCaption,
    setImgBlockCaption,
    blockImageSearch,
    setBlockImageSearch,
    isLoadingImgBlockAssets,
    imgBlockAssetsError,
    filteredBlockImageAssets,
    selectedImgBlockAssetIds,
    toggleImgBlockAssetSelection,
    requiredImageCount,
    selectedImgBlockAssetsCount,
    handleAddSelectedImgBlock,
    imgTrioDimensions,
    selectedLocation,
    blockImageExternalRef,
    blockImageFileNamePrefix,
    token: token || undefined,
    blockImageAltText,
    blockImagePhotographerCredit,
    setBlockImageAltText,
    setBlockImagePhotographerCredit,
    handleBlockImageUploadComplete,
    externalImageCropDraft,
    renderExternalCropEditor,
    unsplashBlockQuery,
    setUnsplashBlockQuery,
    unsplashBlockOrientation,
    setUnsplashBlockOrientation,
    unsplashBlockPerPage,
    setUnsplashBlockPerPage,
    runBlockUnsplashSearch,
    isSearchingUnsplashBlock,
    unsplashBlockError,
    unsplashBlockResults,
    isImportingBlockExternalImage,
    handleImportBlockExternalImage,
    pexelsBlockQuery,
    setPexelsBlockQuery,
    pexelsBlockOrientation,
    setPexelsBlockOrientation,
    pexelsBlockPerPage,
    setPexelsBlockPerPage,
    runBlockPexelsSearch,
    isSearchingPexelsBlock,
    pexelsBlockError,
    pexelsBlockResults,
    isUploadingExternalImageVariants,
    findPreferredVariantAsset,
    addImageAfterBlock,
    setPublishResult,
    setActiveEditingTimelineItemId,
    getImageTimelineItemId,
    mergeMediaAssetsIntoState,
    getImageUrl,
  })

  const layout: EditorialStageLayoutView = {
    stagedArticle,
    stagePath: routes.stagePath,
    hasMissingFeaturedImage,
    isConverting,
    onResetToOriginalBlocks: resetToOriginalBlocks,
    onDelete: handleDelete,
    onUpdateTitle: (title: string) => updateStagedArticle({ title }),
  }

  return (
    <EditorialStageArticleContext.Provider
      value={{
        status,
        layout,
        timelineListProps,
        sidebarProps,
        featuredModalProps,
        blockModalProps,
      }}
    >
      {children}
    </EditorialStageArticleContext.Provider>
  )
}

export function useEditorialStageArticleContext() {
  const context = useContext(EditorialStageArticleContext)
  if (!context) {
    throw new Error('useEditorialStageArticleContext must be used within EditorialStageArticleProvider')
  }
  return context
}

export function useEditorialStageStatus() {
  return useEditorialStageArticleContext().status
}

export function useEditorialStageLayoutView() {
  return useEditorialStageArticleContext().layout
}

export function useEditorialStageTimelineListProps() {
  return useEditorialStageArticleContext().timelineListProps
}

export function useEditorialStageSidebarProps() {
  return useEditorialStageArticleContext().sidebarProps
}

export function useEditorialStageFeaturedModalProps() {
  return useEditorialStageArticleContext().featuredModalProps
}

export function useEditorialStageBlockModalProps() {
  return useEditorialStageArticleContext().blockModalProps
}
