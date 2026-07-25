import type { StagedArticle } from '../../../types'
import { getMediaAssetUrl } from '../utils/editorial-stage-view.utils'
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
import { getImageTimelineItemId } from '../workflow.service'
import { useEditorialStageDerivedState } from './useEditorialStageDerivedState'
import { useEditorialStageImageBlockAction } from './useEditorialStageImageBlockAction'
import type {
  EditorialStageLayoutView,
} from '../view-model/types'
import type { EditorialStageArticleWorkspace } from './useEditorialStageArticleWorkspace'
import type { EditorialStageArticleMediaController } from './useEditorialStageArticleMediaController'
import type { EditorialStageArticlePublishing } from './useEditorialStageArticlePublishing'

type UseEditorialStageLoadedArticleViewsParams = {
  stagedArticle: StagedArticle
  stagePath: string
  token: string | null | undefined
  workspace: EditorialStageArticleWorkspace
  media: EditorialStageArticleMediaController
  publishing: EditorialStageArticlePublishing
}

type UseEditorialStageLoadedArticleViewsResult = {
  layout: EditorialStageLayoutView
  timelineListProps: TimelineListViewProps
  sidebarProps: SidebarViewProps
  featuredModalProps: FeaturedModalViewProps
  blockModalProps: BlockModalViewProps
}

export function useEditorialStageLoadedArticleViews(
  controllerParams: UseEditorialStageLoadedArticleViewsParams,
): UseEditorialStageLoadedArticleViewsResult {
  const {
    stagedArticle,
    stagePath,
    token,
    workspace,
    media,
    publishing,
  } = controllerParams
  const params = {
    ...workspace.page,
    ...workspace.timeline,
    ...workspace.blocks,
    ...media.featured,
    ...media.block,
    ...media.shared,
    ...publishing,
    stagedArticle,
    stagePath,
    token,
    editorialPublishAnalysis: workspace.editorialPublishAnalysis,
    setPublishResult: workspace.setPublishResult,
    openImagePickerTarget: workspace.uiState.pickers.openImageTarget,
    openEditorialPickerTarget: workspace.uiState.pickers.openEditorialTarget,
    toggleImagePicker: workspace.toggleImagePicker,
    toggleEditorialPicker: workspace.toggleEditorialPicker,
    addNewEditorialBlock: workspace.addEditorialFromPicker,
    setShowImageModalTracked: media.setShowImageModalTracked,
    openBlockImageModalTracked: media.openBlockImageModalTracked,
    closeBlockImageModalTracked: media.closeBlockImageModalTracked,
  }
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
    featuredImageRequirementLabel,
    singleImageRequirementLabel,
    imgPairRequirementLabel,
    imgTrioRequirementLabel,
    requiredImageCount,
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
