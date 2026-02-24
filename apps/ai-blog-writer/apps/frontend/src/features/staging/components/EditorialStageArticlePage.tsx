import { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../providers/useAuth'
import '../../youtube2blog/styles/stage-article.css'
import type {
  EditorialStageArticlePageProps,
  ExternalImageCropContext,
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
import { getMediaAssetUrl } from '../features/editorial-stage-article/utils/editorial-stage-view.utils'
import { buildPayloadContentBlocks } from '../features/editorial-stage-article/services/editorial-stage-publish.service'
import { FeaturedImageModal } from './editorial-stage/FeaturedImageModal'
import { ExternalImageCropEditor } from './editorial-stage/ExternalImageCropEditor'
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
    externalImageCropDraft,
    setExternalImageCropDraft,
    externalImageCropError,
    setExternalImageCropError,
    externalImageUploadProgress,
    setExternalImageUploadProgress,
    isUploadingExternalImageVariants,
    setIsUploadingExternalImageVariants,
    isImportingBlockExternalImage,
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
    findPreferredVariantAsset,
    handleUploadExternalCroppedVariants,
    handleSkipCropExternalImport,
    handleImportFeaturedExternalImage,
    handleImportBlockExternalImage,
    handleUploadComplete,
    handleBlockImageUploadComplete,
    runFeaturedUnsplashSearch,
    runFeaturedPexelsSearch,
    runBlockUnsplashSearch,
    runBlockPexelsSearch,
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

  const renderExternalCropEditor = (context: ExternalImageCropContext) => (
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
  )

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
          <EditorialTimelineList
            stagedArticle={stagedArticle}
            activeEditingTimelineItemId={activeEditingTimelineItemId}
            totalTechnicalBlockCount={totalTechnicalBlockCount}
            timelineItems={timelineItems}
            timelineIndexMap={timelineIndexMap}
            editorialBlockById={editorialBlockById}
            contentBlockById={contentBlockById}
            contentBlockIndexMap={contentBlockIndexMap}
            contentTimelineNumberMap={contentTimelineNumberMap}
            editorialTimelineNumberMap={editorialTimelineNumberMap}
            imageTimelineNumberMap={imageTimelineNumberMap}
            draggedTimelineItemId={draggedTimelineItemId}
            dragOverTimelineItemId={dragOverTimelineItemId}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            editorialPublishAnalysis={editorialPublishAnalysis}
            fixEditorialBlock={fixEditorialBlock}
            toggleTimelineItemEdit={toggleTimelineItemEdit}
            updateEditorialBlockMarkdown={updateEditorialBlockMarkdown}
            removeEditorialBlock={removeEditorialBlock}
            moveTimelineItem={moveTimelineItem}
            openImagePickerTarget={openImagePickerTarget}
            openEditorialPickerTarget={openEditorialPickerTarget}
            toggleImagePicker={toggleImagePicker}
            toggleEditorialPicker={toggleEditorialPicker}
            openBlockImageModal={openBlockImageModal}
            addEditorialFromPicker={addEditorialFromPicker}
            addNewBlock={addNewBlock}
            mergeWithNextBlock={mergeWithNextBlock}
            mediaAssets={mediaAssets}
            getImageUrl={getImageUrl}
            updateMediaGroupCaption={updateMediaGroupCaption}
            removeImgTrioAfterBlock={removeImgTrioAfterBlock}
            removeImgPairAfterBlock={removeImgPairAfterBlock}
            removeImageAfterBlock={removeImageAfterBlock}
            deleteBlock={deleteBlock}
            updateBlockContent={updateBlockContent}
            rewriteTextBlockWithAi={rewriteTextBlockWithAi}
            findHeaderSplitPoints={findHeaderSplitPoints}
            splitBlockAtHeader={splitBlockAtHeader}
            lastContentBlock={lastContentBlock}
          />
        )}
        sidebarContent={(
          <EditorialSidebar
            stagedArticle={stagedArticle}
            isPublishing={isPublishing}
            allFieldsFilled={allFieldsFilled}
            publishResult={publishResult}
            featuredImageRequirementLabel={featuredImageRequirementLabel}
            selectedFeaturedImage={selectedFeaturedImage}
            getImageUrl={getImageUrl}
            onOpenFeaturedImageModal={() => setShowImageModal(true)}
            locations={locations}
            onUpdateStagedArticle={updateStagedArticle}
            onPublish={handlePublish}
          />
        )}
      />

      <FeaturedImageModal
        show={showImageModal}
        publishedToPayload={stagedArticle.publishedToPayload}
        onClose={() => setShowImageModal(false)}
        featuredImageSource={featuredImageSource}
        setFeaturedImageSource={setFeaturedImageSource}
        featuredImageRequirementLabel={featuredImageRequirementLabel}
        imageSearch={imageSearch}
        setImageSearch={setImageSearch}
        filteredFeaturedImageAssets={filteredFeaturedImageAssets}
        selectedFeaturedImage={selectedFeaturedImage}
        findPreferredVariantAsset={findPreferredVariantAsset}
        updateStagedArticle={updateStagedArticle}
        getImageUrl={getImageUrl}
        selectedLocation={selectedLocation}
        stagedArticleId={stagedArticle.id}
        featuredImageFileNamePrefix={featuredImageFileNamePrefix}
        token={token || undefined}
        imageAltText={imageAltText}
        imagePhotographerCredit={imagePhotographerCredit}
        setImageAltText={setImageAltText}
        setImagePhotographerCredit={setImagePhotographerCredit}
        handleUploadComplete={handleUploadComplete}
        externalImageCropDraft={externalImageCropDraft}
        renderExternalCropEditor={renderExternalCropEditor}
        unsplashFeaturedQuery={unsplashFeaturedQuery}
        setUnsplashFeaturedQuery={setUnsplashFeaturedQuery}
        unsplashFeaturedOrientation={unsplashFeaturedOrientation}
        setUnsplashFeaturedOrientation={setUnsplashFeaturedOrientation}
        unsplashFeaturedPerPage={unsplashFeaturedPerPage}
        setUnsplashFeaturedPerPage={setUnsplashFeaturedPerPage}
        runFeaturedUnsplashSearch={runFeaturedUnsplashSearch}
        isSearchingUnsplashFeatured={isSearchingUnsplashFeatured}
        unsplashFeaturedError={unsplashFeaturedError}
        unsplashFeaturedResults={unsplashFeaturedResults}
        isImportingFeaturedExternalImage={isImportingFeaturedExternalImage}
        handleImportFeaturedExternalImage={handleImportFeaturedExternalImage}
        pexelsFeaturedQuery={pexelsFeaturedQuery}
        setPexelsFeaturedQuery={setPexelsFeaturedQuery}
        pexelsFeaturedOrientation={pexelsFeaturedOrientation}
        setPexelsFeaturedOrientation={setPexelsFeaturedOrientation}
        pexelsFeaturedPerPage={pexelsFeaturedPerPage}
        setPexelsFeaturedPerPage={setPexelsFeaturedPerPage}
        runFeaturedPexelsSearch={runFeaturedPexelsSearch}
        isSearchingPexelsFeatured={isSearchingPexelsFeatured}
        pexelsFeaturedError={pexelsFeaturedError}
        pexelsFeaturedResults={pexelsFeaturedResults}
      />

      <BlockImageModal
        show={Boolean(blockImageModal?.show)}
        publishedToPayload={stagedArticle.publishedToPayload}
        onClose={closeBlockImageModal}
        blockImageModal={blockImageModal}
        blockImageSource={blockImageSource}
        setBlockImageSource={setBlockImageSource}
        isImgBlockModal={isImgBlockModal}
        isImgTrioModal={isImgTrioModal}
        isMultiImageModal={isMultiImageModal}
        singleImageRequirementLabel={singleImageRequirementLabel}
        imgPairRequirementLabel={imgPairRequirementLabel}
        imgTrioRequirementLabel={imgTrioRequirementLabel}
        imgTrioFormat={imgTrioFormat}
        setImgTrioFormat={setImgTrioFormat}
        imgBlockCaption={imgBlockCaption}
        setImgBlockCaption={setImgBlockCaption}
        blockImageSearch={blockImageSearch}
        setBlockImageSearch={setBlockImageSearch}
        isLoadingImgBlockAssets={isLoadingImgBlockAssets}
        imgBlockAssetsError={imgBlockAssetsError}
        filteredBlockImageAssets={filteredBlockImageAssets}
        selectedImgBlockAssetIds={selectedImgBlockAssetIds}
        toggleImgBlockAssetSelection={toggleImgBlockAssetSelection}
        requiredImageCount={requiredImageCount}
        findPreferredVariantAsset={findPreferredVariantAsset}
        addImageAfterBlock={addImageAfterBlock}
        setPublishResult={setPublishResult}
        setActiveEditingTimelineItemId={setActiveEditingTimelineItemId}
        getImageTimelineItemId={getImageTimelineItemId}
        mergeMediaAssetsIntoState={mergeMediaAssetsIntoState}
        getImageUrl={getImageUrl}
        selectedImgBlockAssetsCount={selectedImgBlockAssets.length}
        handleAddSelectedImgBlock={handleAddSelectedImgBlock}
        imgTrioDimensions={imgTrioDimensions}
        selectedLocation={selectedLocation}
        blockImageExternalRef={blockImageExternalRef}
        blockImageFileNamePrefix={blockImageFileNamePrefix}
        token={token || undefined}
        blockImageAltText={blockImageAltText}
        blockImagePhotographerCredit={blockImagePhotographerCredit}
        setBlockImageAltText={setBlockImageAltText}
        setBlockImagePhotographerCredit={setBlockImagePhotographerCredit}
        handleBlockImageUploadComplete={handleBlockImageUploadComplete}
        externalImageCropDraft={externalImageCropDraft}
        renderExternalCropEditor={renderExternalCropEditor}
        activeBlockImageRequirementLabel={activeBlockImageRequirementLabel}
        unsplashBlockQuery={unsplashBlockQuery}
        setUnsplashBlockQuery={setUnsplashBlockQuery}
        unsplashBlockOrientation={unsplashBlockOrientation}
        setUnsplashBlockOrientation={setUnsplashBlockOrientation}
        unsplashBlockPerPage={unsplashBlockPerPage}
        setUnsplashBlockPerPage={setUnsplashBlockPerPage}
        runBlockUnsplashSearch={runBlockUnsplashSearch}
        isSearchingUnsplashBlock={isSearchingUnsplashBlock}
        unsplashBlockError={unsplashBlockError}
        unsplashBlockResults={unsplashBlockResults}
        isImportingBlockExternalImage={isImportingBlockExternalImage}
        handleImportBlockExternalImage={handleImportBlockExternalImage}
        pexelsBlockQuery={pexelsBlockQuery}
        setPexelsBlockQuery={setPexelsBlockQuery}
        pexelsBlockOrientation={pexelsBlockOrientation}
        setPexelsBlockOrientation={setPexelsBlockOrientation}
        pexelsBlockPerPage={pexelsBlockPerPage}
        setPexelsBlockPerPage={setPexelsBlockPerPage}
        runBlockPexelsSearch={runBlockPexelsSearch}
        isSearchingPexelsBlock={isSearchingPexelsBlock}
        pexelsBlockError={pexelsBlockError}
        pexelsBlockResults={pexelsBlockResults}
        isUploadingExternalImageVariants={isUploadingExternalImageVariants}
      />
    </>
  )
}
