import { useCallback, useMemo } from 'react'
import type { Location, MediaAsset } from '../../../api'
import type { CreateArticlePayload } from '../../../api'
import type { StagedArticle } from '../../../types'
import { buildSeoPayload } from '../../../../shared/seo/services/seo-section.service'
import type { EditorialPublishAnalysis } from '../editorial-markdown.service'
import { FEATURED_IMAGE_VARIANT } from '../constants'
import { buildPayloadContentBlocks } from '../services/editorial-stage-publish.service'
import type { MediaVariant } from '../types'
import type { TimelineItem } from '../workflow.service'
import type { EditorialStageUiEvent, PublishPhase } from '../state/editorialStageUiMachine'

type DispatchUiEvent = (event: EditorialStageUiEvent) => void

type UseEditorialStagePublishWorkflowParams = {
  token: string | null | undefined
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
  createArticle: (payload: CreateArticlePayload, token: string) => Promise<{ id: number; title: string; slug: string }>
  updateArticle?: (id: number, payload: CreateArticlePayload, token: string) => Promise<{ id: number; title: string; slug: string }>
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
  const handlePublish = useCallback(async () => {
    if (!token || !stagedArticle) return

    dispatchUi({ type: 'PUBLISH_REQUEST' })

    const trimmedTitle = stagedArticle.title.trim()
    const location = locations.find((candidate) => candidate.id === stagedArticle.locationId)
    const resolvedFeaturedAsset = stagedArticle.featuredImageId
      ? findPreferredVariantAsset(stagedArticle.featuredImageId, FEATURED_IMAGE_VARIANT)
      : null
    const fallbackFeaturedImageId = Number(stagedArticle.featuredImageId)
    const featuredImageId = resolvedFeaturedAsset?.id
      ?? (Number.isFinite(fallbackFeaturedImageId) && fallbackFeaturedImageId > 0
        ? fallbackFeaturedImageId
        : null)

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
        location: location.locationKey,
        locationRef: location.id,
        step1_complete: true,
        status: 'draft',
        headerSection: {
          featuredImage: featuredImageId,
        },
        contentBlocks,
        seoSection: buildSeoPayload(stagedArticle.seoSection ?? {
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
        }),
      }

      const result = (
        stagedArticle.payloadArticleId && updateArticle
          ? await updateArticle(stagedArticle.payloadArticleId, payload, token)
          : await createArticle(payload, token)
      )

      await markArticleSynced(stagedArticle.runId, result.id)

      updateStagedArticle({
        publishedToPayload: true,
        payloadArticleId: result.id,
        lexicalConverted: true,
      })

      dispatchUi({
        type: 'PUBLISH_SUCCESS',
        message: `Synced draft article #${result.id}`,
      })
    } catch (error) {
      dispatchUi({
        type: 'PUBLISH_FAILURE',
        message: error instanceof Error ? error.message : 'Failed to sync article',
      })
    }
  }, [
    token,
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
