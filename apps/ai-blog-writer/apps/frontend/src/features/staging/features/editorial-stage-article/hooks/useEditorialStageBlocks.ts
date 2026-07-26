import type { UseEditorialStageBlocksParams } from './editorial-stage-block-actions.types'
import { useEditorialBlockActions } from './useEditorialBlockActions'
import { useEditorialStageBlockAi } from './useEditorialStageBlockAi'
import { useEditorialStageContentBlockActions } from './useEditorialStageContentBlockActions'
import { useEditorialStageMediaBlockActions } from './useEditorialStageMediaBlockActions'

/**
 * Compatibility facade for the editorial-stage workspace.
 *
 * Each action family owns one block-editing concern while consumers retain the
 * original flat callback API.
 */
export function useEditorialStageBlocks({
  stagedArticle,
  timelineItems,
  updateStagedArticle,
  setPublishResult,
  setActiveEditingTimelineItemId,
  rewriteBlockWithAi
}: UseEditorialStageBlocksParams) {
  const editorialActions = useEditorialBlockActions({
    stagedArticle,
    updateStagedArticle,
    setPublishResult,
    setActiveEditingTimelineItemId
  })
  const contentActions = useEditorialStageContentBlockActions({
    stagedArticle,
    updateStagedArticle,
    setActiveEditingTimelineItemId
  })
  const mediaActions = useEditorialStageMediaBlockActions({
    stagedArticle,
    updateStagedArticle
  })
  const aiActions = useEditorialStageBlockAi({
    stagedArticle,
    timelineItems,
    rewriteBlockWithAi
  })

  return {
    fixEditorialBlock: editorialActions.fixEditorialBlock,
    updateEditorialBlockMarkdown: editorialActions.updateEditorialBlockMarkdown,
    removeEditorialBlock: editorialActions.removeEditorialBlock,
    updateBlockContent: contentActions.updateBlockContent,
    rewriteTextBlockWithAi: aiActions.rewriteTextBlockWithAi,
    addImageAfterBlock: mediaActions.addImageAfterBlock,
    addImgPairAfterBlock: mediaActions.addImgPairAfterBlock,
    addImgTrioAfterBlock: mediaActions.addImgTrioAfterBlock,
    updateMediaGroupCaption: mediaActions.updateMediaGroupCaption,
    removeImageAfterBlock: mediaActions.removeImageAfterBlock,
    removeImgPairAfterBlock: mediaActions.removeImgPairAfterBlock,
    removeImgTrioAfterBlock: mediaActions.removeImgTrioAfterBlock,
    mergeWithNextBlock: contentActions.mergeWithNextBlock,
    resetToOriginalBlocks: contentActions.resetToOriginalBlocks,
    findHeaderSplitPoints: contentActions.findHeaderSplitPoints,
    splitBlockAtHeader: contentActions.splitBlockAtHeader,
    addNewBlock: contentActions.addNewBlock,
    addNewEditorialBlock: editorialActions.addNewEditorialBlock,
    deleteBlock: contentActions.deleteBlock
  }
}
