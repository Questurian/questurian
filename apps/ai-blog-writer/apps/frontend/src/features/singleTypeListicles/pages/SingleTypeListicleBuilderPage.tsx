import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../staging/api'
import { useAuth } from '../../../providers/useAuth'
import {
  generateSocialImageFromFeatured as requestGenerateSocialImageFromFeatured,
  uploadSocialImage as requestUploadSocialImage,
} from '../../images'
import { BuilderHeaderPanel } from '../builder/components/BuilderHeaderPanel'
import { BuilderHero } from '../builder/components/BuilderHero'
import { BuilderItemsPanel } from '../builder/components/BuilderItemsPanel'
import { BuilderSeoPanel } from '../builder/components/BuilderSeoPanel'
import { BuilderSetupPanel } from '../builder/components/BuilderSetupPanel'
import { BuilderSidebar } from '../builder/components/BuilderSidebar'
import { useBuilderAutosave } from '../builder/hooks/useBuilderAutosave'
import { useBuilderBootstrap } from '../builder/hooks/useBuilderBootstrap'
import { useBuilderDraftActions } from '../builder/hooks/useBuilderDraftActions'
import { useBuilderProgress } from '../builder/hooks/useBuilderProgress'
import { useListicleSubmit } from '../builder/hooks/useListicleSubmit'
import { useRelatedItems } from '../builder/hooks/useRelatedItems'
import {
  buildListicleAiArticleContext,
  getListicleAiArticleTitle,
} from '../builder/services/ai-rewrite.service'
import {
  applySeoAiPatch,
  buildSeoAiPrompt,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
} from '../builder/services/seo-ai.service'
import type { SeoAiTarget } from '../builder/services/seo-ai.service'
import {
  validateOgSocialImageFile,
} from '../builder/services/seo-social-image-upload.service'
import {
  buildSingleTypeListicleStructuredDataTemplate,
  serializeStructuredDataTemplate,
} from '../builder/services/structured-data-template.service'
import { generateTitleWithAi, rewriteBlockWithAi } from '../api'
import { saveDraft } from '../storage'
import '../styles.css'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

export default function SingleTypeListicleBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')

  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] = useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)
  const [isUploadingOgImage, setIsUploadingOgImage] = useState(false)
  const lastAutoStructuredDataRef = useRef<string>('')

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

  useBuilderAutosave(draft)

  const { relatedItems, isLoadingRelated } = useRelatedItems({ token, draft, onError })

  const actions = useBuilderDraftActions({
    draft,
    setDraft,
    locations,
    relatedItems,
    navigate,
    setSearchParams,
    onError,
    setResult,
  })

  const { isSaving, submit } = useListicleSubmit({
    token,
    draft,
    relatedItems,
    selectedLocationRefId: actions.selectedLocationRefId,
    setDraft,
    setSearchParams,
    onError,
    onResult: setResult,
  })

  const progress = useBuilderProgress(draft)
  const isStep1Locked = Boolean(draft?.step1_complete && !draft?.in_update_mode)
  const isStep2Locked = Boolean(draft?.step2_complete && !draft?.step2_in_update_mode)
  const isStep3Locked = Boolean(draft?.step3_complete && !draft?.step3_in_update_mode)
  const isStep4Ready = isStep1Locked && isStep2Locked && isStep3Locked

  useEffect(() => {
    if (!draft || !isStep4Ready) return

    const nextStructuredData = serializeStructuredDataTemplate(
      buildSingleTypeListicleStructuredDataTemplate({
        draft,
        relatedItems,
      }),
    )

    setDraft((current) => {
      if (!current) return current

      const existingStructuredData = current.seoSection.structuredData.trim()
      const lastAutoStructuredData = lastAutoStructuredDataRef.current.trim()
      const isAutoManaged = (
        !existingStructuredData
        || existingStructuredData === lastAutoStructuredData
        || existingStructuredData === nextStructuredData
      )

      if (!isAutoManaged) {
        return current
      }

      if (existingStructuredData === nextStructuredData) {
        lastAutoStructuredDataRef.current = nextStructuredData
        return current
      }

      lastAutoStructuredDataRef.current = nextStructuredData
      return {
        ...current,
        seoSection: {
          ...current.seoSection,
          structuredData: nextStructuredData,
        },
      }
    })
  }, [draft, isStep4Ready, relatedItems, setDraft])

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
      articleTitle: getListicleAiArticleTitle(draft),
      articleContext: input.includeWholeArticleContext
        ? buildListicleAiArticleContext(draft, relatedItems)
        : undefined,
    })

    const rewrittenContent = response.rewritten_content?.trim()
    if (!rewrittenContent) {
      throw new Error('AI returned empty block content.')
    }

    return rewrittenContent
  }, [draft, relatedItems])

  const saveLocalDraft = useCallback(async (): Promise<void> => {
    if (!draft) return
    saveDraft(draft)
    setError(null)
    setResult('Saved local draft')
  }, [draft])

  const generateSeoWithAi = useCallback(async (target: SeoAiTarget = 'all'): Promise<void> => {
    if (!draft) return

    const articleContext = buildListicleAiArticleContext(draft, relatedItems).trim()
    const articleTitle = getListicleAiArticleTitle(draft).trim()
    const structuredDataTemplate = serializeStructuredDataTemplate(
      buildSingleTypeListicleStructuredDataTemplate({
        draft,
        relatedItems,
      }),
    )
    const hasSourceContent = Boolean(draft.title.trim() || articleContext)
    if (!hasSourceContent) {
      onError('Add article content before generating SEO with AI.')
      return
    }

    onError('')
    setResult(null)
    setIsGeneratingSeoTarget(target)

    try {
      const response = await rewriteBlockWithAi({
        prompt: buildSeoAiPrompt({
          articleType: draft.listicleType
            ? `single-type-listicle (${draft.listicleType})`
            : 'single-type-listicle',
          location: draft.location,
          target,
          structuredDataTemplate: target === 'structuredData' || target === 'all'
            ? structuredDataTemplate
            : undefined,
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
  }, [draft, onError, relatedItems, setDraft])

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

  const uploadOgImageFile = useCallback(async (file: File): Promise<void> => {
    if (!draft) return

    const fileIssue = validateOgSocialImageFile(file)
    if (fileIssue) {
      onError(fileIssue)
      throw new Error(fileIssue)
    }

    if (!token) {
      const message = 'You must be logged in to upload social image URLs.'
      onError(message)
      throw new Error(message)
    }

    const locationRef = actions.selectedLocationRefId ?? draft.locationRef
    if (!locationRef || locationRef < 1) {
      const message = 'Select a location in Step 1 before uploading social images.'
      onError(message)
      throw new Error(message)
    }

    onError('')
    setResult(null)
    setIsUploadingOgImage(true)

    try {
      const articleTitle = draft.title.trim() || 'Untitled listicle'
      const uploadResponse = await requestUploadSocialImage(
        file,
        `Social share image for ${articleTitle}`,
        locationRef,
        token,
        'Questurian Creative',
      )

      const bunnyUrl = uploadResponse.generatedImageUrl.trim()
      if (!bunnyUrl) {
        throw new Error('Uploaded social image is missing Bunny URL.')
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

      setResult('Custom OG image uploaded and applied to OG and Twitter image fields.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload OG image.'
      onError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setIsUploadingOgImage(false)
    }
  }, [actions.selectedLocationRefId, draft, onError, setDraft, token])

  if (isLoading || !draft) {
    return (
      <div className="stl-page stl-single-type-page">
        <p className="stl-placeholder">Loading builder...</p>
      </div>
    )
  }

  return (
    <div className="stl-page stl-single-type-page">
      <BuilderHero draft={draft} onDiscardLocalDraft={actions.handleDiscardLocalDraft} />

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
            setTargetItemCount={actions.setTargetItemCount}
            onTitleAiGenerate={generateDraftTitleWithAi}
          />

          {isStep1Locked ? (
            <BuilderHeaderPanel
              draft={draft}
              token={token}
              locationRef={actions.selectedLocationRefId ?? draft.locationRef}
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
            <BuilderItemsPanel
              draft={draft}
              relatedItems={relatedItems}
              isLoadingRelated={isLoadingRelated}
              moveItem={actions.moveItem}
              removeItem={actions.removeItem}
              updateItem={actions.updateItem}
              onItemBlurbAiRewrite={async (_itemId, input) => rewriteDraftBlockWithAi(input)}
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
              onUploadOgImageFile={uploadOgImageFile}
              isUploadingOgImage={isUploadingOgImage}
            />
          ) : null}
        </main>

        <BuilderSidebar
          draft={draft}
          completionPercent={progress.completionPercent}
          isSetupReady={progress.isSetupReady}
          hasTargetCount={progress.hasTargetCount}
          stepIssues={progress.stepIssues}
          editorModelName={draft.editorModelName}
          onEditorModelChange={actions.setEditorModelName}
          isSaving={isSaving}
          onSaveLocalDraft={saveLocalDraft}
          onSyncToPayload={() => submit('draft')}
        />
      </div>
    </div>
  )
}
