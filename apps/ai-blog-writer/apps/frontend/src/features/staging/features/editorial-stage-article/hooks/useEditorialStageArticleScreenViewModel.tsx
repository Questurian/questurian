import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { StagedArticle } from '../../../types'
import { createEmptySeoSection } from '../../../../../shared/seo/services/seo-section.service'
import {
  createInitialEditorialStageUiState,
  editorialStageUiReducer,
} from '../state/editorialStageUiMachine'
import type {
  EditorialStageArticlePageProps,
  SupportedEditorialComponent,
} from '../types'
import { buildEditorialPublishAnalysis } from '../editorial-markdown.service'
import { getImageTimelineItemId } from '../workflow.service'
import { useEditorialStageBlocks } from './useEditorialStageBlocks'
import { useEditorialStageMedia } from './useEditorialStageMedia'
import { useEditorialStagePageData } from './useEditorialStagePageData'
import { useEditorialStagePublishWorkflow } from './useEditorialStagePublishWorkflow'
import { useEditorialStageTimeline } from './useEditorialStageTimeline'
import { useEditorialStageLoadedArticleViews } from './useEditorialStageLoadedArticleViews'
import type { EditorialStageArticleScreenViewModel, EditorialStageStatusView } from '../view-model/types'
import type { PublishResult } from '../selectors'

type UseEditorialStageArticleScreenViewModelParams = EditorialStageArticlePageProps & {
  token: string | null | undefined
}

const EMPTY_STAGED_ARTICLE: StagedArticle = {
  id: '',
  runId: '',
  originalTitle: '',
  originalContent: '',
  originalType: '',
  title: '',
  content: '',
  blocks: [],
  editorialBlocks: [],
  sharedNeighborhoods: [],
  seoSection: createEmptySeoSection(),
  syncBehavior: 'finalize',
  lexicalConverted: false,
  publishedToPayload: false,
  payloadStatus: undefined,
  payloadSlug: undefined,
  payloadPublishedAt: undefined,
  payloadUpdatedAt: undefined,
  payloadAuthorName: undefined,
  createdAt: '',
  updatedAt: '',
}

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

export function useEditorialStageArticleScreenViewModel({
  storageKey,
  routes,
  api,
  token,
  syncBehavior,
}: UseEditorialStageArticleScreenViewModelParams): EditorialStageArticleScreenViewModel {
  const {
    fetchLocations,
    fetchMediaAssets,
    createArticle,
    updateArticle,
    getArticleById,
    convertMarkdownToLexical,
    fetchResult,
    markArticleSynced,
    getArticleSyncStatus,
    fetchExternalImageSource,
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
    saveConflict,
    updateStagedArticle,
    flushStagedArticleSaves,
    handleDelete,
    mergeMediaAssetsIntoState,
  } = useEditorialStagePageData({
    storageKey,
    stageArticlePath: routes.stageArticlePath,
    stagePath: routes.stagePath,
    token,
    syncBehavior,
    api: {
      fetchResult,
      fetchLocations,
      fetchMediaAssets,
      getArticleSyncStatus,
      getArticleById,
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
      featuredImageUploadExternalRef,
      featuredImageFileNamePrefix,
      showImageModal,
      setShowImageModal,
      featuredImageSource,
      setFeaturedImageSource,
      imageSearch,
      setImageSearch,
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
      runFeaturedUnsplashSearch,
      runFeaturedPexelsSearch,
    },
    block: {
      blockImageModal,
      blockImageSource,
      setBlockImageSource,
      blockImageSearch,
      setBlockImageSearch,
      imgBlockAssets,
      isLoadingImgBlockAssets,
      imgBlockAssetsError,
      hasMoreImgBlockAssets,
      loadMoreImgBlockAssets,
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
      runBlockUnsplashSearch,
      runBlockPexelsSearch,
    },
    shared: {
      findPreferredVariantAsset,
    },
  } = useEditorialStageMedia({
    token,
    stagedArticle,
    locations,
    mediaAssets,
    mergeMediaAssetsIntoState,
    fetchMediaAssets,
    fetchExternalImageSource,
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
      cropOpen: false,
    })
  }, [showImageModal, blockImageModal?.show, dispatchUi])

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

  const {
    handlePublish: handlePublishInner,
    isPublishing,
    isConverting,
    publishResult,
  } = useEditorialStagePublishWorkflow({
    token,
    // Route prefixes double as feature keys ('/url2blog/stage-article' -> 'url2blog'),
    // matching the backend API prefixes for each blog-writer pipeline.
    sourceFeature: routes.stageArticlePath.split('/')[1] ?? '',
    stagedArticle,
    locations,
    mediaAssets,
    timelineItems,
    editorialPublishAnalysis,
    convertMarkdownToLexical,
    createArticle,
    updateArticle,
    markArticleSynced,
    findPreferredVariantAsset,
    updateStagedArticle,
    dispatchUi,
    publishPhase: uiState.publishPhase,
    publishResult: uiState.publishResult,
  })

  // Ensure any pending debounced draft save lands before publishing so the
  // published document reflects the latest local edits.
  const handlePublish = useCallback(async (targetStatus: 'draft' | 'published') => {
    await flushStagedArticleSaves()
    await handlePublishInner(targetStatus)
  }, [flushStagedArticleSaves, handlePublishInner])

  const status: EditorialStageStatusView = useMemo(() => ({
    isLoading,
    error,
    stagedArticle,
    articlesPath: routes.articlesPath,
    saveConflict,
  }), [isLoading, error, stagedArticle, routes.articlesPath, saveConflict])

  const resolvedStagedArticle = stagedArticle ?? EMPTY_STAGED_ARTICLE

  const loadedViews = useEditorialStageLoadedArticleViews({
    stagedArticle: resolvedStagedArticle,
    stagePath: routes.stagePath,
    token,
    locations,
    mediaAssets,
    timelineItems,
    activeEditingTimelineItemId,
    setActiveEditingTimelineItemId,
    draggedTimelineItemId,
    dragOverTimelineItemId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    moveTimelineItem,
    toggleTimelineItemEdit,
    editorialPublishAnalysis,
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
    addNewEditorialBlock: addEditorialFromPicker,
    deleteBlock,
    updateStagedArticle,
    handleDelete,
    isConverting,
    isPublishing,
    publishResult,
    setPublishResult,
    openImagePickerTarget: uiState.pickers.openImageTarget,
    openEditorialPickerTarget: uiState.pickers.openEditorialTarget,
    toggleImagePicker,
    toggleEditorialPicker,
    showImageModal,
    setShowImageModalTracked,
    featuredImageUploadExternalRef,
    featuredImageFileNamePrefix,
    featuredImageSource,
    setFeaturedImageSource,
    imageSearch,
    setImageSearch,
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
    runFeaturedUnsplashSearch,
    runFeaturedPexelsSearch,
    blockImageModal,
    blockImageSource,
    setBlockImageSource,
    blockImageSearch,
    setBlockImageSearch,
    imgBlockAssets,
    isLoadingImgBlockAssets,
    imgBlockAssetsError,
    hasMoreImgBlockAssets,
    loadMoreImgBlockAssets,
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
    openBlockImageModalTracked,
    closeBlockImageModalTracked,
    isImportingBlockExternalImage,
    runBlockUnsplashSearch,
    runBlockPexelsSearch,
    mergeMediaAssetsIntoState,
    findPreferredVariantAsset,
    handlePublish,
  })

  if (isLoading || !stagedArticle || error) {
    return {
      status,
      layout: null,
      timelineListProps: null,
      sidebarProps: null,
      featuredModalProps: null,
      blockModalProps: null,
    }
  }

  return {
    status,
    layout: loadedViews.layout,
    timelineListProps: loadedViews.timelineListProps,
    sidebarProps: loadedViews.sidebarProps,
    featuredModalProps: loadedViews.featuredModalProps,
    blockModalProps: loadedViews.blockModalProps,
  }
}
