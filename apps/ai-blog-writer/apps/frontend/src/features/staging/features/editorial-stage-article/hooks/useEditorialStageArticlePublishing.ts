import { useCallback } from 'react'
import type { EditorialStageArticleApi, EditorialStageRoutes } from '../types'
import type { EditorialStageArticleMediaController } from './useEditorialStageArticleMediaController'
import type { EditorialStageArticleWorkspace } from './useEditorialStageArticleWorkspace'
import { useEditorialStagePublishWorkflow } from './useEditorialStagePublishWorkflow'

type UseEditorialStageArticlePublishingParams = {
  token: string | null | undefined
  routes: EditorialStageRoutes
  api: EditorialStageArticleApi
  workspace: EditorialStageArticleWorkspace
  media: EditorialStageArticleMediaController
}

export function useEditorialStageArticlePublishing({
  token,
  routes,
  api,
  workspace,
  media,
}: UseEditorialStageArticlePublishingParams) {
  const publishWorkflow = useEditorialStagePublishWorkflow({
    token,
    // Route prefixes double as feature keys ('/url2blog/stage-article' -> 'url2blog'),
    // matching the backend API prefixes for each blog-writer pipeline.
    sourceFeature: routes.stageArticlePath.split('/')[1] ?? '',
    stagedArticle: workspace.page.stagedArticle,
    locations: workspace.page.locations,
    mediaAssets: workspace.page.mediaAssets,
    timelineItems: workspace.timeline.timelineItems,
    editorialPublishAnalysis: workspace.editorialPublishAnalysis,
    convertMarkdownToLexical: api.convertMarkdownToLexical,
    createArticle: api.createArticle,
    updateArticle: api.updateArticle,
    markArticleSynced: api.markArticleSynced,
    findPreferredVariantAsset: media.shared.findPreferredVariantAsset,
    updateStagedArticle: workspace.page.updateStagedArticle,
    dispatchUi: workspace.dispatchUi,
    publishPhase: workspace.uiState.publishPhase,
    publishResult: workspace.uiState.publishResult,
  })
  const { flushStagedArticleSaves } = workspace.page
  const { handlePublish: handlePublishInner } = publishWorkflow

  const handlePublish = useCallback(async (targetStatus: 'draft' | 'published') => {
    await flushStagedArticleSaves()
    await handlePublishInner(targetStatus)
  }, [flushStagedArticleSaves, handlePublishInner])

  return {
    isPublishing: publishWorkflow.isPublishing,
    isConverting: publishWorkflow.isConverting,
    publishResult: publishWorkflow.publishResult,
    handlePublish,
  }
}

export type EditorialStageArticlePublishing = ReturnType<
  typeof useEditorialStageArticlePublishing
>
