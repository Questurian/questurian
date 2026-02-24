import type { MediaAsset } from '../../../api'
import type { ContentBlock, EditorialBlock, StagedArticle } from '../../../types'
import type { EditorialPublishValidation } from '../editorial-markdown.service'
import type { BlockImageModalMode, OpenBlockImageModalOptions, SupportedEditorialComponent } from '../types'
import type { TimelineItem } from '../workflow.service'
import type { TimelineListViewProps } from './editorial-stage-view.types'

type BuildTimelineListViewInput = {
  stagedArticle: StagedArticle
  activeEditingTimelineItemId: string | null
  totalTechnicalBlockCount: number
  timelineItems: TimelineItem[]
  timelineIndexMap: Map<string, number>
  editorialBlockById: Map<string, EditorialBlock>
  contentBlockById: Map<string, ContentBlock>
  contentBlockIndexMap: Map<string, number>
  contentTimelineNumberMap: Map<string, number>
  editorialTimelineNumberMap: Map<string, number>
  imageTimelineNumberMap: Map<string, number>
  lastContentBlock: ContentBlock | null

  draggedTimelineItemId: string | null
  dragOverTimelineItemId: string | null
  handleDragStart: (e: React.DragEvent, timelineItemId: string) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent, timelineItemId: string) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent, targetTimelineItemId: string) => void
  moveTimelineItem: (timelineItemId: string, direction: 'up' | 'down') => void

  editorialPublishAnalysis: {
    byId: Record<string, EditorialPublishValidation>
  }
  fixEditorialBlock: (blockId: string) => void
  updateEditorialBlockMarkdown: (blockId: string, nextMarkdown: string) => void
  removeEditorialBlock: (blockId: string) => void

  openImagePickerTarget: string | null
  openEditorialPickerTarget: string | null
  toggleImagePicker: (target: string) => void
  toggleEditorialPicker: (target: string) => void
  openBlockImageModal: (
    blockId: string,
    mode: BlockImageModalMode,
    options?: OpenBlockImageModalOptions
  ) => void
  addEditorialFromPicker: (
    component: SupportedEditorialComponent,
    afterBlockId?: string,
    placeAfterImage?: boolean
  ) => void
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
}

export function buildTimelineListView(input: BuildTimelineListViewInput): TimelineListViewProps {
  return {
    timeline: {
      stagedArticle: input.stagedArticle,
      activeEditingTimelineItemId: input.activeEditingTimelineItemId,
      totalTechnicalBlockCount: input.totalTechnicalBlockCount,
      timelineItems: input.timelineItems,
      timelineIndexMap: input.timelineIndexMap,
      editorialBlockById: input.editorialBlockById,
      contentBlockById: input.contentBlockById,
      contentBlockIndexMap: input.contentBlockIndexMap,
      contentTimelineNumberMap: input.contentTimelineNumberMap,
      editorialTimelineNumberMap: input.editorialTimelineNumberMap,
      imageTimelineNumberMap: input.imageTimelineNumberMap,
      lastContentBlock: input.lastContentBlock,
    },
    drag: {
      draggedTimelineItemId: input.draggedTimelineItemId,
      dragOverTimelineItemId: input.dragOverTimelineItemId,
      handleDragStart: input.handleDragStart,
      handleDragEnd: input.handleDragEnd,
      handleDragOver: input.handleDragOver,
      handleDragLeave: input.handleDragLeave,
      handleDrop: input.handleDrop,
      moveTimelineItem: input.moveTimelineItem,
    },
    editorial: {
      editorialPublishAnalysis: input.editorialPublishAnalysis,
      fixEditorialBlock: input.fixEditorialBlock,
      updateEditorialBlockMarkdown: input.updateEditorialBlockMarkdown,
      removeEditorialBlock: input.removeEditorialBlock,
    },
    picker: {
      openImagePickerTarget: input.openImagePickerTarget,
      openEditorialPickerTarget: input.openEditorialPickerTarget,
      toggleImagePicker: input.toggleImagePicker,
      toggleEditorialPicker: input.toggleEditorialPicker,
      openBlockImageModal: input.openBlockImageModal,
      addEditorialFromPicker: input.addEditorialFromPicker,
      addNewBlock: input.addNewBlock,
      mergeWithNextBlock: input.mergeWithNextBlock,
    },
    content: {
      toggleTimelineItemEdit: input.toggleTimelineItemEdit,
      deleteBlock: input.deleteBlock,
      updateBlockContent: input.updateBlockContent,
      rewriteTextBlockWithAi: input.rewriteTextBlockWithAi,
      findHeaderSplitPoints: input.findHeaderSplitPoints,
      splitBlockAtHeader: input.splitBlockAtHeader,
    },
    media: {
      mediaAssets: input.mediaAssets,
      getImageUrl: input.getImageUrl,
      updateMediaGroupCaption: input.updateMediaGroupCaption,
      removeImgTrioAfterBlock: input.removeImgTrioAfterBlock,
      removeImgPairAfterBlock: input.removeImgPairAfterBlock,
      removeImageAfterBlock: input.removeImageAfterBlock,
    },
  }
}
