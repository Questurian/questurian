import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../staging/api'
import { useAuth } from '../../../providers/useAuth'
import { BuilderHeaderPanel } from '../builder/components/BuilderHeaderPanel'
import { BuilderHero } from '../builder/components/BuilderHero'
import { BuilderPublishPanel } from '../builder/components/BuilderPublishPanel'
import { BuilderSeoPanel } from '../builder/components/BuilderSeoPanel'
import { BuilderSetupPanel } from '../builder/components/BuilderSetupPanel'
import { BuilderSidebar } from '../builder/components/BuilderSidebar'
import { BuilderStopsPanel } from '../builder/components/BuilderStopsPanel'
import { SeoMetadataModal } from '../builder/components/SeoMetadataModal'
import { useBuilderAutosave } from '../builder/hooks/useBuilderAutosave'
import { useBuilderBootstrap } from '../builder/hooks/useBuilderBootstrap'
import { useBuilderDraftActions } from '../builder/hooks/useBuilderDraftActions'
import { useBuilderProgress } from '../builder/hooks/useBuilderProgress'
import { useItinerarySubmit } from '../builder/hooks/useItinerarySubmit'
import { useRelatedItems } from '../builder/hooks/useRelatedItems'
import { buildItineraryAiArticleContext, getItineraryAiArticleTitle } from '../builder/services/ai-rewrite.service'
import { useSeoManager } from '../builder/hooks/useSeoManager'
import { rewriteBlockWithAi } from '../api'
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

  const onError = useCallback((message: string) => {
    setError(message || null)
  }, [])

  const {
    draft,
    setDraft,
    isLoading,
    locations,
    mediaAssets,
    seoOptions,
    setSeoOptions,
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

  const seoManager = useSeoManager({
    token,
    draft,
    setDraft,
    seoOptions,
    setSeoOptions,
    onError,
    mediaAssets,
  })

  const progress = useBuilderProgress({ draft })

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

  if (isLoading || !draft) {
    return (
      <div className="stl-page">
        <p className="stl-placeholder">Loading builder...</p>
      </div>
    )
  }

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
          />

          <BuilderHeaderPanel
            draft={draft}
            mediaAssets={mediaAssets}
            updateHeader={actions.updateHeader}
            onIntroAiRewrite={rewriteDraftBlockWithAi}
          />

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
          />

          <BuilderSeoPanel
            draft={draft}
            seoOptions={seoManager.seoOptions}
            onOpenCreateSeoModal={() => void seoManager.openCreateSeoModal()}
            onOpenEditSeoModal={() => void seoManager.openEditSeoModal()}
            setDraft={setDraft}
          />

          <BuilderPublishPanel
            draft={draft}
            isSaving={isSaving}
            updateDraft={actions.updateDraft}
            onSubmit={submit}
          />
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

      <SeoMetadataModal
        isOpen={seoManager.seoModalOpen}
        mode={seoManager.seoModalMode}
        form={seoManager.seoForm}
        isSaving={seoManager.isSeoSaving}
        mediaAssets={seoManager.mediaAssets}
        setForm={seoManager.setSeoForm}
        onSave={seoManager.handleSaveSeo}
        onClose={seoManager.closeSeoModal}
      />
    </div>
  )
}
