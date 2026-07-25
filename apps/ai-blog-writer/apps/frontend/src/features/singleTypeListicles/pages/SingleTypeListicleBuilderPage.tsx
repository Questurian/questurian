import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth'
import { BuilderHero } from '../../../shared/builder/components/BuilderHero'
import { useBuilderAutosave } from '../../../shared/builder/hooks/useBuilderAutosave'
import { useDraftPayloadSyncState } from '../../../shared/payloadSync/useDraftPayloadSyncState'
import { BuilderHeaderPanel } from '../builder/components/BuilderHeaderPanel'
import { BuilderItemsPanel } from '../builder/components/BuilderItemsPanel'
import { BuilderSeoPanel } from '../builder/components/BuilderSeoPanel'
import { BuilderSetupPanel } from '../builder/components/BuilderSetupPanel'
import { BuilderSidebar } from '../builder/components/BuilderSidebar'
import { InspectListicleRunModal } from '../builder/components/InspectListicleRunModal'
import { useAutoStructuredData } from '../builder/hooks/useAutoStructuredData'
import { useBuilderBootstrap } from '../builder/hooks/useBuilderBootstrap'
import { useBuilderDraftActions } from '../builder/hooks/useBuilderDraftActions'
import { useBuilderProgress } from '../builder/hooks/useBuilderProgress'
import { useListicleSubmit } from '../builder/hooks/useListicleSubmit'
import { useRelatedItems } from '../builder/hooks/useRelatedItems'
import { useSingleTypeListicleAiWriting } from '../builder/hooks/useSingleTypeListicleAiWriting'
import { useSingleTypeListiclePermalink } from '../builder/hooks/useSingleTypeListiclePermalink'
import { useSingleTypeListicleSeo } from '../builder/hooks/useSingleTypeListicleSeo'
import { getSingleTypeAutoWriteTargetIds } from '../builder/services/ai-autowrite.service'
import { buildSingleTypeListicleDraftComparableShape } from '../builder/utils/single-type-listicle-draft-sync-signature'
import { saveDraft } from '../storage'
import '../styles.css'

export default function SingleTypeListicleBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')
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

  useBuilderAutosave(draft, saveDraft)

  const isSynced = Boolean(draft?.payloadId)
  const { hasUnsyncedPayloadChanges } = useDraftPayloadSyncState({
    draft,
    setDraft,
    isLoading,
    routeKey: `${payloadIdParam ?? ''}:${draftIdParam ?? ''}`,
    buildComparableShape: buildSingleTypeListicleDraftComparableShape,
    initializeMissingBaselineAsSynced: true,
  })
  const { relatedItems, isLoadingRelated } = useRelatedItems({
    token,
    draft,
    locations,
    onError,
  })
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
  const progress = useBuilderProgress(draft)
  const aiWriting = useSingleTypeListicleAiWriting({
    draft,
    relatedItems,
    locations,
    setDraft,
    onError,
    setResult,
  })
  const permalink = useSingleTypeListiclePermalink({
    draft,
    locations,
    setDraft,
    onError,
  })
  const seo = useSingleTypeListicleSeo({
    token,
    draft,
    relatedItems,
    selectedLocationRefId: actions.selectedLocationRefId,
    setDraft,
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

  const isStep1Locked = Boolean(draft?.step1_complete && !draft?.in_update_mode)
  const isStep2Locked = Boolean(draft?.step2_complete && !draft?.step2_in_update_mode)
  const isStep3Locked = Boolean(draft?.step3_complete && !draft?.step3_in_update_mode)
  const isStep4Ready = isStep1Locked && isStep3Locked

  useAutoStructuredData({
    draft,
    relatedItems,
    enabled: isStep4Ready,
    setDraft,
  })

  const saveLocalDraft = useCallback(async (): Promise<void> => {
    if (!draft) return
    saveDraft(draft)
    setError(null)
    setResult('Saved local draft')
  }, [draft])

  if (isLoading || !draft) {
    return (
      <div className="stl-page stl-single-type-page">
        {!isLoading && error
          ? <p className="stl-error">{error}</p>
          : <p className="stl-placeholder">Loading builder...</p>}
      </div>
    )
  }

  return (
    <div className="stl-page stl-single-type-page">
      <BuilderHero
        eyebrow="Single Type Listicle Builder"
        newTitle="New Listicle"
        payloadId={draft.payloadId}
        lede="Field-by-field and block-by-block editor for Payload `single-type-listicles`."
        backHref="/single-type-listicles"
        onDiscardLocalDraft={actions.handleDiscardLocalDraft}
      />

      <div className="stl-builder-layout">
        <main className="stl-builder-main">
          {error ? <p className="stl-error">{error}</p> : null}
          {result ? <p className="stl-success">{result}</p> : null}

          {isSynced && hasUnsyncedPayloadChanges ? (
            <div className="stl-out-of-sync-banner" role="status">
              <span className="stl-out-of-sync-banner__dot" aria-hidden="true" />
              <span className="stl-out-of-sync-banner__text">
                Out of sync — you have local changes. Sync to Payload to apply them to the live article.
              </span>
              <button
                type="button"
                className="stl-btn stl-out-of-sync-banner__btn"
                onClick={() => void submit('draft')}
                disabled={isSaving}
              >
                {isSaving ? 'Syncing...' : 'Save & Sync'}
              </button>
            </div>
          ) : null}

          <BuilderSetupPanel
            draft={draft}
            locations={locations}
            isSynced={isSynced}
            onContinue={actions.handleContinue}
            onUpdateSetup={actions.handleUpdateSetup}
            onSaveSetup={actions.handleSaveSetup}
            onCancelUpdateSetup={actions.cancelUpdateSetup}
            updateDraft={actions.updateDraft}
            setTargetItemCount={actions.setTargetItemCount}
            onTitleAiGenerate={permalink.generateTitle}
            onSlugChange={permalink.applySlugAndOgUrl}
            onGenerateSlugWithAi={permalink.generateSlug}
            isGeneratingSlug={permalink.isGeneratingSlug}
          />

          {(isStep1Locked || isSynced) ? (
            <BuilderHeaderPanel
              draft={draft}
              token={token}
              locationRef={actions.selectedLocationRefId ?? draft.locationRef}
              mediaAssets={mediaAssets}
              updateHeader={actions.updateHeader}
              onIntroAiAutoWrite={aiWriting.autoWriteIntro}
              isIntroAiGenerating={aiWriting.isIntroAiGenerating}
              introAiQueueCount={aiWriting.introAiQueueCount}
              introAiStatus={aiWriting.introAiStatus}
              introAiDisabledReason={aiWriting.introAiDisabledReason}
              onIntroInspect={() => aiWriting.openInspect(aiWriting.introTargetId, 'Intro')}
              introHasInspectableSteps={Boolean(
                aiWriting.stepsByTargetId[aiWriting.introTargetId]?.length,
              )}
              isLocked={isStep2Locked}
              isSynced={isSynced}
              onContinueStep2={actions.handleContinueStep2}
              onUpdateStep2={actions.handleUpdateStep2}
              onSaveStep2={actions.handleSaveStep2}
              onCancelStep2Update={actions.cancelUpdateStep2}
            />
          ) : null}

          {isStep1Locked || isSynced ? (
            <BuilderItemsPanel
              draft={draft}
              relatedItems={relatedItems}
              isLoadingRelated={isLoadingRelated}
              moveItem={actions.moveItem}
              removeItem={actions.removeItem}
              updateItem={actions.updateItem}
              onItemBlurbAiAutoWrite={aiWriting.autoWriteItemBlurb}
              onItemBlurbInspect={(itemId, index) =>
                aiWriting.openInspect(`${itemId}_blurb`, `Item ${index + 1} blurb`)
              }
              hasInspectableStepsByItemId={Object.fromEntries(
                draft.items.map((entry) => [
                  entry.id,
                  Boolean(aiWriting.stepsByTargetId[`${entry.id}_blurb`]?.length),
                ]),
              )}
              activeAiItemId={aiWriting.runningAiItemId}
              queuedAiItemIds={aiWriting.queuedAiItemIds}
              isLocked={isStep3Locked}
              isSynced={isSynced}
              onContinueStep3={actions.handleContinueStep3}
              onUpdateStep3={actions.handleUpdateStep3}
              onSaveStep3={actions.handleSaveStep3}
              onCancelStep3Update={actions.cancelUpdateStep3}
            />
          ) : null}

          {(isStep4Ready || isSynced) ? (
            <BuilderSeoPanel
              draft={draft}
              setDraft={setDraft}
              onGenerateSeoWithAi={seo.generateSeo}
              isGeneratingSeoTarget={seo.isGeneratingSeoTarget}
              onGenerateSeoImageFromFeatured={seo.generateImageFromFeatured}
              isGeneratingSeoImage={seo.isGeneratingSeoImage}
              onUploadOgImageFile={seo.uploadOgImageFile}
              isUploadingOgImage={seo.isUploadingOgImage}
              onAutoFillOgUrl={permalink.autoFillOgUrl}
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
          isAutoWritingEmptyFields={aiWriting.isAutoWritingEmptyFields}
          autoWriteEmptyFieldsQueueCount={aiWriting.autoWriteEmptyFieldsQueueCount}
          autoWriteEmptyFieldsStatus={aiWriting.autoWriteEmptyFieldsStatus}
          canAutoWriteEmptyFields={
            (isSynced || isStep1Locked)
            && getSingleTypeAutoWriteTargetIds(draft, relatedItems).length > 0
          }
          onAutoWriteEmptyFields={aiWriting.autoWriteEmptyFields}
          onSaveLocalDraft={saveLocalDraft}
          onSyncToPayload={() => submit('draft')}
        />
      </div>

      <InspectListicleRunModal
        isOpen={Boolean(aiWriting.inspectTarget)}
        onClose={aiWriting.closeInspect}
        targetLabel={aiWriting.inspectTarget?.label ?? ''}
        steps={
          aiWriting.inspectTarget
            ? aiWriting.stepsByTargetId[aiWriting.inspectTarget.targetId]
            : undefined
        }
        isRunning={
          aiWriting.inspectTarget
            ? aiWriting.visualStateById[aiWriting.inspectTarget.targetId] === 'running'
            : false
        }
        autoCloseOnCompletion={aiWriting.inspectTarget?.openedAutomatically ?? false}
      />
    </div>
  )
}
