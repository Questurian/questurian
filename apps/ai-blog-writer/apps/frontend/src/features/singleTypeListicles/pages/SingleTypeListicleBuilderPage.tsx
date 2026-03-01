import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../staging/api'
import { useAuth } from '../../../providers/useAuth'
import { BuilderHeaderPanel } from '../builder/components/BuilderHeaderPanel'
import { BuilderHero } from '../builder/components/BuilderHero'
import { BuilderItemsPanel } from '../builder/components/BuilderItemsPanel'
import { BuilderPublishPanel } from '../builder/components/BuilderPublishPanel'
import { BuilderSeoPanel } from '../builder/components/BuilderSeoPanel'
import { BuilderSetupPanel } from '../builder/components/BuilderSetupPanel'
import { BuilderSidebar } from '../builder/components/BuilderSidebar'
import { SeoMetadataModal } from '../builder/components/SeoMetadataModal'
import { useBuilderAutosave } from '../builder/hooks/useBuilderAutosave'
import { useBuilderBootstrap } from '../builder/hooks/useBuilderBootstrap'
import { useBuilderDraftActions } from '../builder/hooks/useBuilderDraftActions'
import { useBuilderProgress } from '../builder/hooks/useBuilderProgress'
import { useListicleSubmit } from '../builder/hooks/useListicleSubmit'
import { useRelatedItems } from '../builder/hooks/useRelatedItems'
import { buildListicleAiArticleContext, getListicleAiArticleTitle } from '../builder/services/ai-rewrite.service'
import { useSeoManager } from '../builder/hooks/useSeoManager'
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

  useBuilderAutosave(draft)

  const { relatedItems, isLoadingRelated } = useRelatedItems({ token, draft, onError })

  const actions = useBuilderDraftActions({
    draft,
    setDraft,
    locations,
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

  const seoManager = useSeoManager({
    token,
    draft,
    setDraft,
    setSeoOptions,
    onError,
  })

  const progress = useBuilderProgress(draft)

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
      articleContext: input.includeWholeArticleContext ? buildListicleAiArticleContext(draft) : undefined,
    })

    const rewrittenContent = response.rewritten_content?.trim()
    if (!rewrittenContent) {
      throw new Error('AI returned empty block content.')
    }

    return rewrittenContent
  }, [draft])

  const saveLocalDraft = useCallback(async (): Promise<void> => {
    if (!draft) return
    saveDraft(draft)
    setError(null)
    setResult('Saved local draft')
  }, [draft])

  if (isLoading || !draft) {
    return (
      <div className="stl-page">
        <p className="stl-placeholder">Loading builder...</p>
      </div>
    )
  }

  const isStep1Submitted = draft.step1_complete

  return (
    <div className="stl-page">
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

          {isStep1Submitted ? (
            <>
              <BuilderHeaderPanel
                draft={draft}
                token={token}
                locationRef={actions.selectedLocationRefId ?? draft.locationRef}
                mediaAssets={mediaAssets}
                updateHeader={actions.updateHeader}
                onIntroAiRewrite={rewriteDraftBlockWithAi}
              />

              <BuilderItemsPanel
                draft={draft}
                relatedItems={relatedItems}
                isLoadingRelated={isLoadingRelated}
                moveItem={actions.moveItem}
                removeItem={actions.removeItem}
                updateItem={actions.updateItem}
                onItemBlurbAiRewrite={async (_itemId, input) => rewriteDraftBlockWithAi(input)}
              />

              <BuilderSeoPanel
                seoId={draft.seoSection.seo}
                seoOptions={seoOptions}
                onSelectSeoId={actions.setSeoId}
                onOpenCreateSeoModal={() => void seoManager.openCreateSeoModal()}
                onOpenEditSeoModal={() => void seoManager.openEditSeoModal()}
              />

              <BuilderPublishPanel
                draft={draft}
                isSaving={isSaving}
                onSaveLocalDraft={saveLocalDraft}
                onSyncToPayload={() => submit('draft')}
              />
            </>
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

      <SeoMetadataModal
        isOpen={seoManager.seoModalOpen}
        mode={seoManager.seoModalMode}
        form={seoManager.seoForm}
        isSaving={seoManager.isSeoSaving}
        mediaAssets={mediaAssets}
        setForm={seoManager.setSeoForm}
        onSave={seoManager.handleSaveSeo}
        onClose={seoManager.closeSeoModal}
      />
    </div>
  )
}
