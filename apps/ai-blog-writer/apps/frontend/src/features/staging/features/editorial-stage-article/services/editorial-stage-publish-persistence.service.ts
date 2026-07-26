import type { SchemaPublisherConfig } from '../../../../../shared/seo/services/schema-publisher-config.service'
import { buildSeoPayload } from '../../../../../shared/seo/services/seo-section.service'
import type { SeoSection } from '../../../../../shared/seo/types'
import { markDraftAsPayloadSynced } from '../../../../../shared/payloadSync/draftPayloadSync'
import type { CreateArticlePayload } from '../../../api'
import type { PayloadArticleDoc } from '../../../api/articles/articles.types'
import type { StagedArticle } from '../../../types'
import type { PayloadContentBlock } from '../editorial-markdown.service'
import { buildPayloadArticleMetadataPatch } from './payload-article-metadata.service'
import {
  buildStagedArticlePayloadComparableShape,
  hasPayloadArticleIdentity
} from './staged-article-payload-sync.service'
import { preparePublishedEditorialSeoSection } from './editorial-stage-publish-structured-data.service'
import type {
  EditorialPublishInput,
  EditorialPublishTargetStatus
} from './editorial-stage-publish-validation.service'

type PersistEditorialStageArticleParams = {
  token: string
  sourceFeature: string
  targetStatus: EditorialPublishTargetStatus
  stagedArticle: StagedArticle
  publishInput: EditorialPublishInput
  seoSection: SeoSection
  contentBlocks: PayloadContentBlock[]
  publisherConfig: SchemaPublisherConfig
  createArticle: (
    payload: CreateArticlePayload,
    token: string
  ) => Promise<PayloadArticleDoc>
  updateArticle?: (
    id: number,
    payload: CreateArticlePayload,
    token: string
  ) => Promise<PayloadArticleDoc>
  markArticleSynced: (
    runId: string,
    payloadArticleId: number
  ) => Promise<{ message: string; run_id: string; payload_article_id: number }>
}

export type PersistEditorialStageArticleResult = {
  article: PayloadArticleDoc
  stagedArticlePatch: Partial<StagedArticle>
  syncBookkeepingFailed: boolean
}

function buildArticlePayload(input: {
  sourceFeature: string
  targetStatus: EditorialPublishTargetStatus
  stagedArticle: StagedArticle
  publishInput: EditorialPublishInput
  seoSection: SeoSection
  contentBlocks: PayloadContentBlock[]
}): CreateArticlePayload {
  const {
    sourceFeature,
    targetStatus,
    stagedArticle,
    publishInput,
    seoSection,
    contentBlocks
  } = input

  return {
    title: publishInput.title,
    ...(stagedArticle.payloadSlug?.trim()
      ? { slug: stagedArticle.payloadSlug.trim() }
      : {}),
    location: publishInput.location.locationKey,
    locationRef: publishInput.location.id,
    sharedNeighborhoods: publishInput.sharedNeighborhoods,
    step1_complete: true,
    status: targetStatus,
    ...(sourceFeature ? { sourceFeature } : {}),
    ...(stagedArticle.runId ? { sourceRunId: stagedArticle.runId } : {}),
    headerSection: {
      featuredImage: publishInput.featuredImageId
    },
    contentBlocks,
    seoSection: buildSeoPayload(seoSection)
  }
}

async function persistPayloadArticle(
  input: PersistEditorialStageArticleParams
): Promise<{
  article: PayloadArticleDoc
  seoSection: SeoSection
}> {
  const payload = buildArticlePayload(input)
  let article =
    input.stagedArticle.payloadArticleId && input.updateArticle
      ? await input.updateArticle(
          input.stagedArticle.payloadArticleId,
          payload,
          input.token
        )
      : await input.createArticle(payload, input.token)
  let seoSection = input.seoSection

  if (input.targetStatus !== 'published' || !input.updateArticle) {
    return { article, seoSection }
  }

  const publishedSeoSection = preparePublishedEditorialSeoSection({
    stagedArticle: input.stagedArticle,
    seoSection,
    locationLabel: input.publishInput.locationLabel,
    publisherConfig: input.publisherConfig,
    publishedArticle: article
  })

  if (publishedSeoSection.structuredData !== seoSection.structuredData.trim()) {
    article = await input.updateArticle(
      article.id,
      {
        ...payload,
        seoSection: buildSeoPayload(publishedSeoSection)
      },
      input.token
    )
  }

  seoSection = publishedSeoSection
  return { article, seoSection }
}

async function recordLocalSync(input: {
  article: PayloadArticleDoc
  stagedArticle: StagedArticle
  markArticleSynced: PersistEditorialStageArticleParams['markArticleSynced']
}): Promise<boolean> {
  try {
    await input.markArticleSynced(input.stagedArticle.runId, input.article.id)
    return false
  } catch (error) {
    console.warn(
      `Article #${input.article.id} saved to Payload, but marking run ${input.stagedArticle.runId} as synced failed:`,
      error
    )
    return true
  }
}

export async function persistEditorialStageArticle(
  input: PersistEditorialStageArticleParams
): Promise<PersistEditorialStageArticleResult> {
  const { article, seoSection } = await persistPayloadArticle(input)
  const syncBookkeepingFailed = await recordLocalSync({
    article,
    stagedArticle: input.stagedArticle,
    markArticleSynced: input.markArticleSynced
  })
  const metadataPatch = buildPayloadArticleMetadataPatch({
    doc: article,
    fallbackAuthorName: input.publisherConfig.defaultAuthorName
  })
  const syncedArticle = markDraftAsPayloadSynced(
    {
      ...input.stagedArticle,
      ...metadataPatch,
      seoSection,
      lexicalConverted: true
    },
    buildStagedArticlePayloadComparableShape,
    article.updatedAt || new Date().toISOString(),
    { hasPayloadIdentity: hasPayloadArticleIdentity }
  )

  return {
    article,
    syncBookkeepingFailed,
    stagedArticlePatch: {
      ...metadataPatch,
      seoSection,
      lexicalConverted: true,
      currentPayloadSignature: syncedArticle.currentPayloadSignature,
      lastPayloadSyncSignature: syncedArticle.lastPayloadSyncSignature,
      lastPayloadSyncAt: syncedArticle.lastPayloadSyncAt,
      hasUnsyncedPayloadChanges: syncedArticle.hasUnsyncedPayloadChanges
    }
  }
}
