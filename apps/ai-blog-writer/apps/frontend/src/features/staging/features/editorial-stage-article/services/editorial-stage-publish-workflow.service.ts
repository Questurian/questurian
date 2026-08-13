import type { SchemaPublisherConfig } from '../../../../../shared/seo/services/schema-publisher-config.service'
import type { Location, MediaAsset } from '../../../api'
import type { CreateArticlePayload } from '../../../api'
import type { PayloadArticleDoc } from '../../../api/articles/articles.types'
import type { StagedArticle } from '../../../types'
import type { EditorialPublishAnalysis } from '../editorial-markdown.service'
import type { MediaVariant } from '../types'
import type { TimelineItem } from '../workflow.service'
import { buildPayloadContentBlocks } from './editorial-stage-publish.service'
import { persistEditorialStageArticle } from './editorial-stage-publish-persistence.service'
import { prepareEditorialPublishSeoSection } from './editorial-stage-publish-structured-data.service'
import {
  type EditorialPublishTargetStatus,
  resolveEditorialPublishInput,
  validateEditorialPublishReadiness
} from './editorial-stage-publish-validation.service'

export type EditorialPublishLifecycle = {
  request: () => void
  converting: () => void
  submitting: () => void
  succeed: (message: string) => void
  fail: (message: string) => void
}

export type EditorialStagePublishWorkflowParams = {
  sourceFeature: string
  targetStatus: EditorialPublishTargetStatus
  stagedArticle: StagedArticle
  locations: Location[]
  mediaAssets: MediaAsset[]
  timelineItems: TimelineItem[]
  editorialPublishAnalysis: EditorialPublishAnalysis
  publisherConfig: SchemaPublisherConfig
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
  lifecycle: EditorialPublishLifecycle
}

function getSuccessMessage(input: {
  targetStatus: EditorialPublishTargetStatus
  stagedArticle: StagedArticle
  articleId: number
  syncBookkeepingFailed: boolean
}): string {
  const message =
    input.targetStatus === 'published'
      ? input.stagedArticle.payloadStatus === 'published'
        ? `Updated published article #${input.articleId}`
        : `Published article #${input.articleId}`
      : `Saved draft article #${input.articleId}`

  return input.syncBookkeepingFailed
    ? `${message} (local run record missing, sync status not recorded)`
    : message
}

export async function runEditorialStagePublishWorkflow(
  input: EditorialStagePublishWorkflowParams
): Promise<void> {
  input.lifecycle.request()

  try {
    const resolvedInput = resolveEditorialPublishInput(input)
    if (!resolvedInput.success) {
      input.lifecycle.fail(resolvedInput.message)
      return
    }

    const seoSection = prepareEditorialPublishSeoSection({
      stagedArticle: input.stagedArticle,
      seoSection: resolvedInput.value.seoSection,
      locationLabel: resolvedInput.value.locationLabel,
      publisherConfig: input.publisherConfig,
      targetStatus: input.targetStatus
    })
    const readinessIssue = validateEditorialPublishReadiness({
      targetStatus: input.targetStatus,
      seoSection,
      locationLabel: resolvedInput.value.locationLabel,
      editorialPublishAnalysis: input.editorialPublishAnalysis
    })
    if (readinessIssue) {
      input.lifecycle.fail(readinessIssue)
      return
    }

    input.lifecycle.converting()
    const { contentBlocks, textBlocksAdded } = await buildPayloadContentBlocks({
      stagedArticle: input.stagedArticle,
      timelineItems: input.timelineItems,
      editorialPublishAnalysis: input.editorialPublishAnalysis,
      mediaAssets: input.mediaAssets,
      convertMarkdownToLexical: input.convertMarkdownToLexical
    })
    if (textBlocksAdded === 0) {
      throw new Error(
        'Add at least one text block with content before publishing'
      )
    }

    input.lifecycle.submitting()
    const result = await persistEditorialStageArticle({
      ...input,
      publishInput: resolvedInput.value,
      seoSection,
      contentBlocks
    })

    input.updateStagedArticle(result.stagedArticlePatch)
    input.lifecycle.succeed(
      getSuccessMessage({
        targetStatus: input.targetStatus,
        stagedArticle: input.stagedArticle,
        articleId: result.article.id,
        syncBookkeepingFailed: result.syncBookkeepingFailed
      })
    )
  } catch (error) {
    input.lifecycle.fail(
      error instanceof Error ? error.message : 'Failed to sync article'
    )
  }
}
