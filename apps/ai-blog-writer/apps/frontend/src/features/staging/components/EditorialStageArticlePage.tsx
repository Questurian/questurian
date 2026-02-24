import { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../providers/useAuth'
import '../../youtube2blog/styles/stage-article.css'
import type {
  EditorialStageArticlePageProps,
  SupportedEditorialComponent,
} from '../features/editorial-stage-article/types'
import {
  FEATURED_IMAGE_VARIANT,
} from '../features/editorial-stage-article/constants'
import {
  buildImageFileNamePrefix,
} from '../features/editorial-stage-article/media-utils'
import {
  buildEditorialPublishAnalysis,
} from '../features/editorial-stage-article/editorial-markdown.service'
import {
  getImageTimelineItemId,
} from '../features/editorial-stage-article/workflow.service'
import { useEditorialStageDerivedState } from '../features/editorial-stage-article/hooks/useEditorialStageDerivedState'
import { useEditorialStageTimeline } from '../features/editorial-stage-article/hooks/useEditorialStageTimeline'
import { useEditorialStageBlocks } from '../features/editorial-stage-article/hooks/useEditorialStageBlocks'
import { useEditorialStagePageData } from '../features/editorial-stage-article/hooks/useEditorialStagePageData'
import { useEditorialStageMedia } from '../features/editorial-stage-article/hooks/useEditorialStageMedia'
import { useEditorialStageImageBlockAction } from '../features/editorial-stage-article/hooks/useEditorialStageImageBlockAction'
import { useEditorialStagePageViewModel } from '../features/editorial-stage-article/hooks/useEditorialStagePageViewModel'
import { getMediaAssetUrl } from '../features/editorial-stage-article/utils/editorial-stage-view.utils'
import { buildPayloadContentBlocks } from '../features/editorial-stage-article/services/editorial-stage-publish.service'
import { FeaturedImageModal } from './editorial-stage/FeaturedImageModal'
import { BlockImageModal } from './editorial-stage/BlockImageModal'
import { EditorialSidebar } from './editorial-stage/EditorialSidebar'
import { EditorialTimelineList } from './editorial-stage/EditorialTimelineList'
import { EditorialStageLayout } from './editorial-stage/EditorialStageLayout'

export default function EditorialStageArticlePage({
  storageKey,
  routes,
  api,
}: EditorialStageArticlePageProps) {
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
  const { token } = useAuth()

  // Form state
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null)
  const [openEditorialPickerTarget, setOpenEditorialPickerTarget] = useState<string | null>(null)
  const [openImagePickerTarget, setOpenImagePickerTarget] = useState<string | null>(null)

  // Conversion state
  const [isConverting, setIsConverting] = useState(false)
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
    setOpenEditorialPickerTarget((current) => (
      current === target ? null : target
    ))
  }, [])

  const toggleImagePicker = useCallback((target: string) => {
    setOpenImagePickerTarget((current) => (
      current === target ? null : target
    ))
  }, [])

  const addEditorialFromPicker = useCallback((
    component: SupportedEditorialComponent,
    afterBlockId?: string,
    placeAfterImage?: boolean
  ) => {
    void placeAfterImage
    addNewEditorialBlock(component, afterBlockId)
    setOpenEditorialPickerTarget(null)
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
    clearOpenImagePickerTarget: () => setOpenImagePickerTarget(null),
  })

  const handlePublish = async () => {
    if (!token || !stagedArticle) return

    const trimmedTitle = stagedArticle.title.trim()
    const location = locations.find(l => l.id === stagedArticle.locationId)
    const featuredImage =
      stagedArticle.featuredImageId
        ? findPreferredVariantAsset(stagedArticle.featuredImageId, FEATURED_IMAGE_VARIANT)
        : null

    if (!trimmedTitle) {
      setPublishResult({
        success: false,
        message: 'Please enter an article title'
      })
      return
    }

    if (!location || !featuredImage) {
      setPublishResult({
        success: false,
        message: !location ? 'Please select a location' : 'Please select a featured image'
      })
      return
    }

    setIsPublishing(true)
    setPublishResult(null)
    setIsConverting(true)

    try {
      const { contentBlocks, textBlocksAdded } = await buildPayloadContentBlocks({
        stagedArticle,
        timelineItems,
        editorialPublishAnalysis,
        mediaAssets,
        convertMarkdownToLexical,
      })

      if (textBlocksAdded === 0) {
        throw new Error('Add at least one text block with content before publishing')
      }

      setIsConverting(false)

      const result = await createArticle({
        title: trimmedTitle,
        location: location.locationKey,
        locationRef: location.id,
        step1_complete: true,
        status: 'draft',
        headerSection: {
          featuredImage: featuredImage.id,
        },
        contentBlocks,
      }, token)

      // Mark as synced in the backend database
      await markArticleSynced(stagedArticle.runId, result.id)

      // Update staged article with publish status
      updateStagedArticle({
        publishedToPayload: true,
        payloadArticleId: result.id,
        lexicalConverted: true,
      })

      setPublishResult({
        success: true,
        message: `Published! Article ID: ${result.id}`
      })
    } catch (err) {
      setPublishResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to publish'
      })
    } finally {
      setIsPublishing(false)
      setIsConverting(false)
    }
  }

  if (isLoading || !stagedArticle) {
    return (
      <div className="stage-article-page">
        <div className="stage-article-loading">
          <div className="stage-article-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stage-article-page">
        <div className="stage-article-error">
          <h2>Error</h2>
          <p>{error}</p>
          <Link to={routes.articlesPath} className="stage-article-btn">Back to Articles</Link>
        </div>
      </div>
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
    closeBlockImageModal,
    setPublishResult,
  })
  const vm = useEditorialStagePageViewModel({
    stagedArticle,
    locations,
    selectedLocation,
    selectedFeaturedImage,
    allFieldsFilled,
    hasMissingFeaturedImage,
    isPublishing,
    publishResult,
    updateStagedArticle,
    totalTechnicalBlockCount,
    activeEditingTimelineItemId,
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
    openImagePickerTarget,
    openEditorialPickerTarget,
    toggleImagePicker,
    toggleEditorialPicker,
    openBlockImageModal,
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
    showImageModal,
    setShowImageModal,
    featuredImageRequirementLabel,
    featuredImageSource,
    setFeaturedImageSource,
    imageSearch,
    setImageSearch,
    filteredFeaturedImageAssets,
    imageAltText,
    imagePhotographerCredit,
    setImageAltText,
    setImagePhotographerCredit,
    handleUploadComplete,
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
    blockImageModal,
    closeBlockImageModal,
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
    selectedImgBlockAssetsCount: selectedImgBlockAssets.length,
    handleAddSelectedImgBlock,
    imgTrioDimensions,
    blockImageExternalRef,
    blockImageFileNamePrefix,
    token: token || undefined,
    blockImageAltText,
    blockImagePhotographerCredit,
    setBlockImageAltText,
    setBlockImagePhotographerCredit,
    handleBlockImageUploadComplete,
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
    externalImageCropDraft,
    setExternalImageCropDraft,
    externalImageCropError,
    setExternalImageCropError,
    externalImageUploadProgress,
    setExternalImageUploadProgress,
    isUploadingExternalImageVariants,
    setIsUploadingExternalImageVariants,
    handleSkipCropExternalImport,
    handleUploadExternalCroppedVariants,
    findPreferredVariantAsset,
    addImageAfterBlock,
    setPublishResult,
    setActiveEditingTimelineItemId,
    getImageTimelineItemId,
    mergeMediaAssetsIntoState,
    featuredImageFileNamePrefix,
  })

  return (
    <>
      <EditorialStageLayout
        stagedArticle={stagedArticle}
        stagePath={routes.stagePath}
        hasMissingFeaturedImage={hasMissingFeaturedImage}
        isConverting={isConverting}
        onResetToOriginalBlocks={resetToOriginalBlocks}
        onDelete={handleDelete}
        onUpdateTitle={(title) => updateStagedArticle({ title })}
        mainContent={(
          <EditorialTimelineList {...vm.timelineList} />
        )}
        sidebarContent={(
          <EditorialSidebar
            {...vm.sidebar}
            onPublish={handlePublish}
          />
        )}
      />

      <FeaturedImageModal {...vm.featuredModal} />

      <BlockImageModal {...vm.blockModal} />
    </>
  )
}
