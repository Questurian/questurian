import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../staging/api'
import { useAuth } from '../../../providers/useAuth'
import { generateSocialImageFromFeatured as requestGenerateSocialImageFromFeatured } from '../../images'
import { BuilderHeaderPanel } from '../builder/components/BuilderHeaderPanel'
import { BuilderHero } from '../builder/components/BuilderHero'
import { BuilderPublishPanel } from '../builder/components/BuilderPublishPanel'
import { BuilderSeoPanel } from '../builder/components/BuilderSeoPanel'
import { BuilderSetupPanel } from '../builder/components/BuilderSetupPanel'
import { BuilderSidebar } from '../builder/components/BuilderSidebar'
import { BuilderStopsPanel } from '../builder/components/BuilderStopsPanel'
import { useBuilderAutosave } from '../builder/hooks/useBuilderAutosave'
import { useBuilderBootstrap } from '../builder/hooks/useBuilderBootstrap'
import { useBuilderDraftActions } from '../builder/hooks/useBuilderDraftActions'
import { useBuilderProgress } from '../builder/hooks/useBuilderProgress'
import { useItinerarySubmit } from '../builder/hooks/useItinerarySubmit'
import { useRelatedItems } from '../builder/hooks/useRelatedItems'
import {
  buildItineraryAiArticleContext,
  getItineraryAiArticleTitle,
} from '../builder/services/ai-rewrite.service'
import {
  applySeoAiPatch,
  buildSeoAiPrompt,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
} from '../builder/services/seo-ai.service'
import type { SeoAiTarget } from '../builder/services/seo-ai.service'
import { generateTitleWithAi, rewriteBlockWithAi } from '../api'
import '../styles.css'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

export default function ListicleItineraryBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')

  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] = useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)

  const onError = useCallback((message: string) => {
    setError(message || null)
  }, [])

  const {
    draft,
    setDraft,
    isLoading,
    locations,
    mediaAssets,
  } = useBuilderBootstrap({
    token,
    payloadIdParam,
    draftIdParam,
    setSearchParams,
    onError,
  })

  useBuilderAutosave({ draft })

  const { isLoadingRelated, relatedByBlockType } = useRelatedItems({
    token,
    location: draft?.location,
    onError,
  })

  const actions = useBuilderDraftActions({
    draft,
    setDraft,
    locations,
    relatedByBlockType,
    navigate,
    setSearchParams,
    onError,
    setResult,
  })

  const { isSaving, submit } = useItinerarySubmit({
    token,
    draft,
    setDraft,
    selectedLocationRefId: actions.selectedLocationRefId,
    relatedByBlockType,
    setSearchParams,
    onError,
    setResult,
  })

  const progress = useBuilderProgress({ draft })

  const generateDraftTitleWithAi = useCallback(async ({ prompt }: { prompt: string }): Promise<string> => {
    if (!draft) {
      throw new Error('Draft is not loaded yet.')
    }

    const response = await generateTitleWithAi({
      currentTitle: draft.title.trim(),
      prompt: prompt.trim(),
      modelName: resolveEditorAssistModelName(draft.editorModelName),
    })

    const title = response.title?.trim()
    if (!title) {
      throw new Error('AI returned an empty title.')
    }

    return title
  }, [draft])

  const rewriteDraftBlockWithAi = useCallback(async (input: AiRewriteInput): Promise<string> => {
    if (!draft) {
      throw new Error('Draft is not loaded yet.')
    }

    const currentContent = input.currentContent.trim()
    if (!currentContent) {
      throw new Error('Add starter text before using AI rewrite.')
    }

    const response = await rewriteBlockWithAi({
      prompt: input.prompt.trim(),
      blockContent: currentContent,
      modelName: resolveEditorAssistModelName(draft.editorModelName),
      articleTitle: getItineraryAiArticleTitle(draft),
      articleContext: input.includeWholeArticleContext ? buildItineraryAiArticleContext(draft) : undefined,
    })

    const rewrittenContent = response.rewritten_content?.trim()
    if (!rewrittenContent) {
      throw new Error('AI returned empty block content.')
    }

    return rewrittenContent
  }, [draft])

  const generateSeoWithAi = useCallback(async (target: SeoAiTarget = 'all'): Promise<void> => {
    if (!draft) return

    const articleContext = buildItineraryAiArticleContext(draft).trim()
    const articleTitle = getItineraryAiArticleTitle(draft).trim()
    const hasSourceContent = Boolean(draft.title.trim() || articleContext)
    if (!hasSourceContent) {
      onError('Add article content before generating SEO with AI.')
      return
    }

    onError('')
    setResult(null)
    setIsGeneratingSeoTarget(target)

    try {
      const itineraryWindow = `${draft.itineraryStartHour}:${draft.itineraryStartMinute} ${draft.itineraryStartPeriod} - ${draft.itineraryEndHour}:${draft.itineraryEndMinute} ${draft.itineraryEndPeriod}`
      const response = await rewriteBlockWithAi({
        prompt: buildSeoAiPrompt({
          articleType: 'listicle-itinerary',
          location: draft.location,
          dayAudience: draft.dayAudience || undefined,
          itineraryWindow,
          target,
        }),
        blockContent: buildSeoAiSeed(draft.seoSection),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        articleTitle,
        articleContext: articleContext || undefined,
      })

      const aiText = response.rewritten_content?.trim()
      if (!aiText) {
        throw new Error('AI returned empty SEO content.')
      }

      const seoPatch = parseSeoAiPatch(aiText)
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          seoSection: applySeoAiPatch(current.seoSection, seoPatch, target),
        }
      })

      if (target === 'all') {
        setResult('SEO fields generated with AI (images unchanged).')
      } else {
        setResult(`${getSeoAiTargetLabel(target)} generated with AI (images unchanged).`)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate SEO with AI.')
    } finally {
      setIsGeneratingSeoTarget(null)
    }
  }, [draft, onError, setDraft])

  const generateSeoImageFromFeatured = useCallback(async (): Promise<void> => {
    if (!draft) return

    const featuredAssetId = draft.header.featuredImage
    if (!featuredAssetId) {
      onError('Select a featured image in Step 2 before generating social image URLs.')
      return
    }

    if (!token) {
      onError('You must be logged in to generate social image URLs.')
      return
    }

    onError('')
    setResult(null)
    setIsGeneratingSeoImage(true)

    try {
      const response = await requestGenerateSocialImageFromFeatured(featuredAssetId, token)
      const bunnyUrl = response.generatedImageUrl.trim()
      if (!bunnyUrl) {
        throw new Error('Generated social image is missing Bunny URL.')
      }

      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          seoSection: {
            ...current.seoSection,
            openGraph: {
              ...current.seoSection.openGraph,
              imageUrl: bunnyUrl,
            },
            twitterCard: {
              ...current.seoSection.twitterCard,
              imageUrl: bunnyUrl,
            },
          },
        }
      })

      setResult('Social image generated from featured image. Bunny URL applied to OG and Twitter.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate social image from featured image.')
    } finally {
      setIsGeneratingSeoImage(false)
    }
  }, [draft, onError, setDraft, token])

  if (isLoading || !draft) {
    return (
      <div className="stl-page">
        <p className="stl-placeholder">Loading builder...</p>
      </div>
    )
  }

  const isStep1Locked = draft.step1_complete && !draft.in_update_mode
  const isStep2Locked = draft.step2_complete && !draft.step2_in_update_mode
  const isStep3Locked = draft.step3_complete && !draft.step3_in_update_mode

  return (
    <div className="stl-page">
      <BuilderHero payloadId={draft.payloadId} onDiscardLocalDraft={actions.handleDiscardLocalDraft} />

      <div className="stl-builder-layout">
        <main className="stl-builder-main">
          {error ? <p className="stl-error">{error}</p> : null}
          {result ? <p className="stl-success">{result}</p> : null}

          <BuilderSetupPanel
            draft={draft}
            locations={locations}
            onContinue={actions.handleContinue}
            onUpdateSetup={actions.handleUpdateSetup}
            onSaveSetup={actions.handleSaveSetup}
            onCancelUpdateSetup={actions.cancelUpdateSetup}
            updateDraft={actions.updateDraft}
            onTitleAiGenerate={generateDraftTitleWithAi}
          />

          {isStep1Locked ? (
            <BuilderHeaderPanel
              draft={draft}
              mediaAssets={mediaAssets}
              updateHeader={actions.updateHeader}
              onIntroAiRewrite={rewriteDraftBlockWithAi}
              isLocked={isStep2Locked}
              onContinueStep2={actions.handleContinueStep2}
              onUpdateStep2={actions.handleUpdateStep2}
              onSaveStep2={actions.handleSaveStep2}
              onCancelStep2Update={actions.cancelUpdateStep2}
            />
          ) : null}

          {isStep1Locked && isStep2Locked ? (
            <BuilderStopsPanel
              draft={draft}
              isLoadingRelated={isLoadingRelated}
              relatedByBlockType={relatedByBlockType}
              onAddItem={actions.addItem}
              onEndHereOnLastStop={actions.endHereOnLastStop}
              onMoveItem={actions.moveItem}
              onRemoveItem={actions.removeItem}
              onUpdateItem={actions.updateItem}
              onStopBlurbAiRewrite={async (_itemId, input) => rewriteDraftBlockWithAi(input)}
              isLocked={isStep3Locked}
              onContinueStep3={actions.handleContinueStep3}
              onUpdateStep3={actions.handleUpdateStep3}
              onSaveStep3={actions.handleSaveStep3}
              onCancelStep3Update={actions.cancelUpdateStep3}
            />
          ) : null}

          {isStep1Locked && isStep2Locked && isStep3Locked ? (
            <BuilderSeoPanel
              draft={draft}
              setDraft={setDraft}
              onGenerateSeoWithAi={generateSeoWithAi}
              isGeneratingSeoTarget={isGeneratingSeoTarget}
              onGenerateSeoImageFromFeatured={generateSeoImageFromFeatured}
              isGeneratingSeoImage={isGeneratingSeoImage}
            />
          ) : null}

          {isStep1Locked && isStep2Locked && isStep3Locked ? (
            <BuilderPublishPanel
              draft={draft}
              isSaving={isSaving}
              updateDraft={actions.updateDraft}
              onSubmit={submit}
            />
          ) : null}
        </main>

        <BuilderSidebar
          completionPercent={progress.completionPercent}
          draft={draft}
          hasContinuousCoverage={progress.hasContinuous}
          isSetupReady={progress.isSetupReady}
          editorModelName={draft.editorModelName}
          onEditorModelChange={actions.setEditorModelName}
          isSaving={isSaving}
          stepIssues={progress.stepIssues}
          onSubmit={submit}
        />
      </div>
    </div>
  )
}
