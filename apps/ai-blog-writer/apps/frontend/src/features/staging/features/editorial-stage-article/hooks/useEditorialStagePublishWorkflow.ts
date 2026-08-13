import { useCallback, useMemo } from 'react'
import { getSchemaPublisherConfig } from '../../../../../shared/seo/services/schema-publisher-config.service'
import type { Location, MediaAsset } from '../../../api'
import type { CreateArticlePayload } from '../../../api'
import type { PayloadArticleDoc } from '../../../api/articles/articles.types'
import type { StagedArticle } from '../../../types'
import type { EditorialPublishAnalysis } from '../editorial-markdown.service'
import { runEditorialStagePublishWorkflow } from '../services/editorial-stage-publish-workflow.service'
import type { EditorialPublishTargetStatus } from '../services/editorial-stage-publish-validation.service'
import type {
  EditorialStageUiEvent,
  PublishPhase
} from '../state/editorialStageUiMachine'
import type { MediaVariant } from '../types'
import type { TimelineItem } from '../workflow.service'
import { useEditorialStagePublishUi } from './useEditorialStagePublishUi'

type UseEditorialStagePublishWorkflowParams = {
  sourceFeature: string
  stagedArticle: StagedArticle | null
  locations: Location[]
  mediaAssets: MediaAsset[]
  timelineItems: TimelineItem[]
  editorialPublishAnalysis: EditorialPublishAnalysis
  convertMarkdownToLexical: (markdown: string) => Promise<{
    success: boolean
    data?: object
    error?: string
  }>
  createArticle: (
    payload: CreateArticlePayload,
  ) => Promise<PayloadArticleDoc>
  updateArticle?: (
    id: number,
    payload: CreateArticlePayload,
  ) => Promise<PayloadArticleDoc>
  markArticleSynced: (
    runId: string,
    payloadArticleId: number
  ) => Promise<{ message: string; run_id: string; payload_article_id: number }>
  findPreferredVariantAsset: (
    assetId: number,
    preferredVariant: MediaVariant
  ) => MediaAsset | null
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  dispatchUi: (event: EditorialStageUiEvent) => void
  publishPhase: PublishPhase
  publishResult: { success: boolean; message: string } | null
}

export function useEditorialStagePublishWorkflow({
  sourceFeature,
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
  publishPhase,
  publishResult,
  dispatchUi
}: UseEditorialStagePublishWorkflowParams) {
  const publisherConfig = useMemo(() => getSchemaPublisherConfig(), [])
  const workflow = useMemo(
    () => ({
      sourceFeature,
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
      updateStagedArticle
    }),
    [
      sourceFeature,
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
      updateStagedArticle
    ]
  )
  const publishUi = useEditorialStagePublishUi({
    dispatchUi,
    publishPhase,
    publishResult
  })

  const handlePublish = useCallback(
    async (targetStatus: EditorialPublishTargetStatus) => {
      if (!stagedArticle) return

      await runEditorialStagePublishWorkflow({
        ...workflow,
        targetStatus,
        stagedArticle,
        publisherConfig,
        lifecycle: publishUi.lifecycle
      })
    },
    [publisherConfig, publishUi.lifecycle, stagedArticle, workflow]
  )

  return {
    handlePublish,
    isPublishing: publishUi.isPublishing,
    isConverting: publishUi.isConverting,
    publishResult: publishUi.publishResult
  }
}
