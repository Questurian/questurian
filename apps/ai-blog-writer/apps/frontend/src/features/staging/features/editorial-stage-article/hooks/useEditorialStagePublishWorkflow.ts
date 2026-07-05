import { useCallback, useMemo } from 'react'
import type { Location, MediaAsset } from '../../../api'
import type { CreateArticlePayload } from '../../../api'
import type { PayloadArticleDoc } from '../../../api/articles/articles.types'
import type { StagedArticle } from '../../../types'
import { getSchemaPublisherConfig } from '../../../../../shared/seo/services/schema-publisher-config.service'
import { buildSeoPayload } from '../../../../../shared/seo/services/seo-section.service'
import type { EditorialPublishAnalysis } from '../editorial-markdown.service'
import { FEATURED_IMAGE_VARIANT } from '../constants'
import { buildPayloadContentBlocks } from '../services/editorial-stage-publish.service'
import { buildPayloadArticleMetadataPatch } from '../services/payload-article-metadata.service'
import {
  buildLegacyStandardArticleStructuredDataTemplate,
  buildStandardArticleStructuredDataTemplate,
  isSeoCoreComplete,
  serializeStandardArticleStructuredDataTemplate,
  shouldAutoManageStandardArticleStructuredData,
  validateStandardArticleSeoSection,
} from '../services/standard-article-seo.service'
import type { MediaVariant } from '../types'
import type { TimelineItem } from '../workflow.service'
import type { EditorialStageUiEvent, PublishPhase } from '../state/editorialStageUiMachine'
import { getLocationDisplayName } from '../utils/editorial-stage-view.utils'
import { sanitizeSharedNeighborhoods } from '../utils/sharedNeighborhoods'

type DispatchUiEvent = (event: EditorialStageUiEvent) => void

type UseEditorialStagePublishWorkflowParams = {
  token: string | null | undefined
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
  createArticle: (payload: CreateArticlePayload, token: string) => Promise<PayloadArticleDoc>
  updateArticle?: (id: number, payload: CreateArticlePayload, token: string) => Promise<PayloadArticleDoc>
  markArticleSynced: (
    runId: string,
    payloadArticleId: number
  ) => Promise<{ message: string; run_id: string; payload_article_id: number }>
  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  dispatchUi: DispatchUiEvent
  publishPhase: PublishPhase
  publishResult: { success: boolean; message: string } | null
}

export function useEditorialStagePublishWorkflow({
  token,
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
  dispatchUi,
  publishPhase,
  publishResult,
}: UseEditorialStagePublishWorkflowParams) {
  const schemaPublisherConfig = useMemo(() => getSchemaPublisherConfig(), [])

  const handlePublish = useCallback(async (targetStatus: 'draft' | 'published') => {
    if (!token || !stagedArticle) return

    dispatchUi({ type: 'PUBLISH_REQUEST' })

    const trimmedTitle = stagedArticle.title.trim()
    const location = locations.find((candidate) => candidate.id === stagedArticle.locationId)
    const sharedNeighborhoods = sanitizeSharedNeighborhoods(
      stagedArticle.sharedNeighborhoods,
      locations,
      stagedArticle.locationId
    )
    const resolvedFeaturedAsset = stagedArticle.featuredImageId
      ? findPreferredVariantAsset(stagedArticle.featuredImageId, FEATURED_IMAGE_VARIANT)
      : null
    const fallbackFeaturedImageId = Number(stagedArticle.featuredImageId)
    const featuredImageId = resolvedFeaturedAsset?.id
      ?? (Number.isFinite(fallbackFeaturedImageId) && fallbackFeaturedImageId > 0
        ? fallbackFeaturedImageId
        : null)
    const seoSection = stagedArticle.seoSection ?? {
      seoTitle: '',
      metaDescription: '',
      openGraph: {
        title: '',
        description: '',
        imageUrl: '',
        url: '',
      },
      twitterCard: {
        card: 'summary',
        title: '',
        description: '',
        imageUrl: '',
      },
      structuredData: '',
      robots: {
        index: 'index',
        follow: 'follow',
      },
    }

    if (!trimmedTitle) {
      dispatchUi({
        type: 'PUBLISH_FAILURE',
        message: 'Please enter an article title',
      })
      return
    }

    if (!location || !featuredImageId) {
      dispatchUi({
        type: 'PUBLISH_FAILURE',
        message: !location ? 'Please select a location' : 'Please select a featured image',
      })
      return
    }

    const locationLabel = [
      location.neighborhoodName,
      location.cityName,
      location.countryName,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(', ')
      || getLocationDisplayName(location)
      || location.locationKey
    const prePublishStructuredData = serializeStandardArticleStructuredDataTemplate(
      buildStandardArticleStructuredDataTemplate({
        stagedArticle: {
          ...stagedArticle,
          seoSection,
        },
        locationLabel,
        publisherConfig: schemaPublisherConfig,
      }),
    )
    const legacyStructuredData = serializeStandardArticleStructuredDataTemplate(
      buildLegacyStandardArticleStructuredDataTemplate({
        stagedArticle: {
          ...stagedArticle,
          seoSection,
        },
        locationLabel,
      }),
    )
    const shouldRefreshDraftStructuredData = shouldAutoManageStandardArticleStructuredData({
      existingStructuredData: seoSection.structuredData.trim(),
      nextStructuredData: prePublishStructuredData,
      legacyStructuredData,
    })
    const seoSectionForSubmit = targetStatus === 'published'
      ? {
          ...seoSection,
          structuredData: prePublishStructuredData,
        }
      : shouldRefreshDraftStructuredData
        ? {
            ...seoSection,
            structuredData: prePublishStructuredData,
          }
        : seoSection

    if (targetStatus === 'published') {
      if (!isSeoCoreComplete(seoSectionForSubmit)) {
        dispatchUi({
          type: 'PUBLISH_FAILURE',
          message: 'Publishing requires SEO title and meta description.',
        })
        return
      }

      if (!seoSectionForSubmit.structuredData.trim()) {
        dispatchUi({
          type: 'PUBLISH_FAILURE',
          message: 'Publishing requires structured data.',
        })
        return
      }

      if (!seoSectionForSubmit.openGraph.imageUrl.trim()) {
        dispatchUi({
          type: 'PUBLISH_FAILURE',
          message: 'Publishing requires an Open Graph image URL.',
        })
        return
      }

      const seoIssues = validateStandardArticleSeoSection({
        seoSection: seoSectionForSubmit,
        locationLabel,
      })
      if (seoIssues.length > 0) {
        dispatchUi({
          type: 'PUBLISH_FAILURE',
          message: seoIssues[0],
        })
        return
      }
    }

    if (editorialPublishAnalysis.hasBlockingBlocks) {
      const previewMessage = editorialPublishAnalysis.blockingBlocks
        .slice(0, 2)
        .map((block) => block.message)
        .join(' · ')
      const remainingCount = editorialPublishAnalysis.blockingBlocks.length - 2
      const remainingSuffix = remainingCount > 0 ? ` (+${remainingCount} more)` : ''
      dispatchUi({
        type: 'PUBLISH_FAILURE',
        message: previewMessage
          ? `Fix editorial blocks before publishing: ${previewMessage}${remainingSuffix}`
          : 'Fix editorial blocks before publishing',
      })
      return
    }

    try {
      dispatchUi({ type: 'PUBLISH_CONVERTING' })

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

      dispatchUi({ type: 'PUBLISH_SUBMITTING' })

      const payload: CreateArticlePayload = {
        title: trimmedTitle,
        ...(stagedArticle.payloadSlug?.trim() ? { slug: stagedArticle.payloadSlug.trim() } : {}),
        location: location.locationKey,
        locationRef: location.id,
        sharedNeighborhoods,
        step1_complete: true,
        status: targetStatus,
        ...(sourceFeature ? { sourceFeature } : {}),
        ...(stagedArticle.runId ? { sourceRunId: stagedArticle.runId } : {}),
        headerSection: {
          featuredImage: featuredImageId,
        },
        contentBlocks,
        seoSection: buildSeoPayload(seoSectionForSubmit),
      }

      let result = (
        stagedArticle.payloadArticleId && updateArticle
          ? await updateArticle(stagedArticle.payloadArticleId, payload, token)
          : await createArticle(payload, token)
      )

      let nextSeoSection = seoSectionForSubmit

      if (targetStatus === 'published' && updateArticle) {
        const publishedStructuredData = serializeStandardArticleStructuredDataTemplate(
          buildStandardArticleStructuredDataTemplate({
            stagedArticle: {
              ...stagedArticle,
              ...buildPayloadArticleMetadataPatch({
                doc: result,
                fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
              }),
              seoSection: seoSectionForSubmit,
            },
            locationLabel,
            publisherConfig: schemaPublisherConfig,
          }),
        )

        nextSeoSection = {
          ...seoSectionForSubmit,
          structuredData: publishedStructuredData,
        }

        if (publishedStructuredData !== seoSectionForSubmit.structuredData.trim()) {
          result = await updateArticle(result.id, {
            ...payload,
            seoSection: buildSeoPayload(nextSeoSection),
          }, token)
        }
      }

      // Local sync bookkeeping only — the Payload save above already succeeded,
      // so a missing/deleted local run row must not surface as a publish failure.
      let syncBookkeepingFailed = false
      try {
        await markArticleSynced(stagedArticle.runId, result.id)
      } catch (syncError) {
        syncBookkeepingFailed = true
        console.warn(
          `Article #${result.id} saved to Payload, but marking run ${stagedArticle.runId} as synced failed:`,
          syncError,
        )
      }

      updateStagedArticle({
        ...buildPayloadArticleMetadataPatch({
          doc: result,
          fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
        }),
        seoSection: nextSeoSection,
        lexicalConverted: true,
      })

      const successMessage = targetStatus === 'published'
        ? (stagedArticle.payloadStatus === 'published'
          ? `Updated published article #${result.id}`
          : `Published article #${result.id}`)
        : `Saved draft article #${result.id}`

      dispatchUi({
        type: 'PUBLISH_SUCCESS',
        message: syncBookkeepingFailed
          ? `${successMessage} (local run record missing, sync status not recorded)`
          : successMessage,
      })
    } catch (error) {
      dispatchUi({
        type: 'PUBLISH_FAILURE',
        message: error instanceof Error ? error.message : 'Failed to sync article',
      })
    }
  }, [
    token,
    sourceFeature,
    stagedArticle,
    dispatchUi,
    locations,
    findPreferredVariantAsset,
    mediaAssets,
    convertMarkdownToLexical,
    createArticle,
    updateArticle,
    editorialPublishAnalysis,
    markArticleSynced,
    schemaPublisherConfig,
    timelineItems,
    updateStagedArticle,
  ])

  const isPublishing = useMemo(
    () => publishPhase === 'validating' || publishPhase === 'converting' || publishPhase === 'publishing',
    [publishPhase]
  )
  const isConverting = useMemo(() => publishPhase === 'converting', [publishPhase])

  return {
    handlePublish,
    isPublishing,
    isConverting,
    publishResult,
  }
}
