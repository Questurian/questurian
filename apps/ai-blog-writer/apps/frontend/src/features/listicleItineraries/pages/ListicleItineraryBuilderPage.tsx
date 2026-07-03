import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth'
import { BuilderHeaderPanel } from '../builder/components/BuilderHeaderPanel'
import { BuilderDayTabs } from '../builder/components/BuilderDayTabs'
import { BuilderHero } from '../../../shared/builder/components/BuilderHero'
import { BuilderPublishPanel } from '../builder/components/BuilderPublishPanel'
import { BuilderSeoPanel } from '../builder/components/BuilderSeoPanel'
import { BuilderSetupPanel } from '../builder/components/BuilderSetupPanel'
import { BuilderSidebar } from '../builder/components/BuilderSidebar'
import { BuilderStopsPanel } from '../builder/components/BuilderStopsPanel'
import { OutOfSyncBanner } from '../builder/components/OutOfSyncBanner'
import { useBuilderBootstrap } from '../builder/hooks/useBuilderBootstrap'
import { useBuilderDraftActions } from '../builder/hooks/useBuilderDraftActions'
import { useBuilderProgress } from '../builder/hooks/useBuilderProgress'
import { useDayShellLibrary } from '../builder/hooks/useDayShellLibrary'
import { useItineraryBuilderAiActions } from '../builder/hooks/useItineraryBuilderAiActions'
import { useItineraryDraftSyncState } from '../builder/hooks/useItineraryDraftSyncState'
import { useItinerarySubmit } from '../builder/hooks/useItinerarySubmit'
import { useRelatedItems } from '../builder/hooks/useRelatedItems'
import { getItineraryAutoWriteTargetIds } from '../builder/services/ai-autowrite.service'
import {
  getItineraryIntroComposeDisabledReason,
  getItineraryIntroTargetId,
} from '../builder/services/intro-composer.service'
import {
  getComposableDayIndexes,
  getItineraryDayBlurbComposeDisabledReason,
} from '../builder/services/compose-day-blurbs.service'
import {
  buildListicleItineraryStructuredDataTemplate,
  serializeStructuredDataTemplate,
} from '../builder/services/structured-data-template.service'
import { getItinerarySchemaPublisherConfig } from '../builder/services/schema-config.service'
import { InspectAutobuildRunModal } from '../builder/components/InspectAutobuildRunModal'
import { InspectIntroComposeRunModal } from '../builder/components/InspectIntroComposeRunModal'
import { InspectDayBlurbComposeRunModal } from '../builder/components/InspectDayBlurbComposeRunModal'
import { DayShellLibraryModal } from '../builder/components/DayShellLibraryModal'
import { StopBlurbComposeChoiceModal } from '../builder/components/StopBlurbComposeChoiceModal'
import '../styles.css'
const schemaPublisherConfig = getItinerarySchemaPublisherConfig()
export default function ListicleItineraryBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [isLayoutManagerOpen, setIsLayoutManagerOpen] = useState(false)
  const {
    libraryShells,
    createLibraryShell,
    updateLibraryShell,
    deleteLibraryShell,
  } = useDayShellLibrary()

  const onError = useCallback((message: string) => {
    setError(message || null)
  }, [])

  const {
    draft,
    setDraft,
    isLoading,
    locations,
    mediaAssets,
    instagramPosts,
  } = useBuilderBootstrap({
    token,
    payloadIdParam,
    draftIdParam,
    setSearchParams,
    onError,
  })

  const {
    hasLocalChanges,
    isRevertingToPayload,
    isSynced,
    onSyncResult,
    saveLocalDraft,
    revertToPayloadVersion,
  } = useItineraryDraftSyncState({
    token,
    draft,
    setDraft,
    isLoading,
    payloadIdParam,
    draftIdParam,
    onError,
    setResult,
  })

  useEffect(() => {
    if (!draft) return
    if (activeDayIndex >= draft.dayCount) {
      setActiveDayIndex(Math.max(0, draft.dayCount - 1))
    }
  }, [draft, activeDayIndex])

  const { isLoadingRelated, relatedByBlockType } = useRelatedItems({
    token,
    location: draft?.location,
    sharedNeighborhoods: draft?.sharedNeighborhoods,
    locations,
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
    mediaAssets,
    instagramPosts,
    setSearchParams,
    onError,
    setResult: onSyncResult,
  })

  const progress = useBuilderProgress({ draft })
  const isStep1Locked = draft?.step1_complete && !draft?.in_update_mode
  const isStep2Locked = draft?.step2_complete && !draft?.step2_in_update_mode
  const isStep3Locked = draft?.step3_complete && !draft?.step3_in_update_mode
  const isStep4Ready = Boolean(isStep1Locked && isStep2Locked && isStep3Locked)
  const canonicalStructuredData = useMemo(() => {
    if (!draft || !isStep4Ready) return ''
    return serializeStructuredDataTemplate(
      buildListicleItineraryStructuredDataTemplate({
        draft,
        relatedByBlockType,
        mediaAssets,
        instagramPosts,
        publisherConfig: schemaPublisherConfig,
      }),
    )
  }, [draft, instagramPosts, isStep4Ready, mediaAssets, relatedByBlockType])

  useEffect(() => {
    if (!draft || !isStep4Ready || !canonicalStructuredData) return
    if (isSynced && !hasLocalChanges) return

    setDraft((current) => {
      if (!current) return current
      const existingStructuredData = current.seoSection.structuredData.trim()
      if (existingStructuredData === canonicalStructuredData) {
        return current
      }

      return {
        ...current,
        seoSection: {
          ...current.seoSection,
          structuredData: canonicalStructuredData,
        },
      }
    })
  }, [canonicalStructuredData, draft, hasLocalChanges, isStep4Ready, isSynced, setDraft])

  const aiActions = useItineraryBuilderAiActions({
    token,
    draft,
    setDraft,
    locations,
    relatedByBlockType,
    canonicalStructuredData,
    onError,
    setResult,
  })

  if (isLoading || !draft) return (
    <div className="stl-page">
      {!isLoading && error
        ? <p className="stl-error">{error}</p>
        : <p className="stl-placeholder">Loading builder...</p>}
    </div>
  )

  const isStep1LockedView = draft.step1_complete && !draft.in_update_mode
  const isStep2LockedView = draft.step2_complete && !draft.step2_in_update_mode
  const isStep3LockedView = draft.step3_complete && !draft.step3_in_update_mode
  const isPublishedPayload = draft.payloadStatus === 'published' || draft.status === 'published'
  const syncTargetStatus = isPublishedPayload ? 'published' : 'draft'

  return (
    <div className="stl-page">
      <BuilderHero
        eyebrow="Listicle Itinerary Builder"
        newTitle="New Itinerary"
        payloadId={draft.payloadId}
        lede="Field-by-field and block-by-block editor for Payload `listicle-itineraries`."
        backHref="/listicle-itineraries"
        onDiscardLocalDraft={actions.handleDiscardLocalDraft}
      />

      <div className="stl-builder-layout">
        <main className="stl-builder-main">
          {error ? <p className="stl-error">{error}</p> : null}
          {result ? <p className="stl-success">{result}</p> : null}

          {isSynced && hasLocalChanges ? (
            <OutOfSyncBanner
              isPublishedPayload={isPublishedPayload}
              isSaving={isSaving}
              onSync={() => void submit(syncTargetStatus)}
            />
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
            onSlugChange={aiActions.applySlugAndOgUrl}
            onGenerateSlugWithAi={aiActions.handleGenerateSlugWithAi}
            isGeneratingSlug={aiActions.isGeneratingSlug}
            onGenerateItinerary={aiActions.handleGenerateItinerary}
            isGeneratingItinerary={aiActions.isGeneratingItinerary}
            onComposeTravelerBrief={aiActions.composeTravelerBrief}
            onViewAutobuildReport={() => aiActions.setIsAutobuildReportOpen(true)}
            hasAutobuildReport={Boolean(aiActions.autobuildReport)}
            libraryShells={libraryShells}
            onOpenLayoutManager={() => setIsLayoutManagerOpen(true)}
          />

          <InspectAutobuildRunModal
            isOpen={aiActions.isAutobuildReportOpen}
            onClose={() => aiActions.setIsAutobuildReportOpen(false)}
            report={aiActions.autobuildReport}
          />

          <DayShellLibraryModal
            isOpen={isLayoutManagerOpen}
            libraryShells={libraryShells}
            onCreate={createLibraryShell}
            onUpdate={updateLibraryShell}
            onDelete={deleteLibraryShell}
            onClose={() => setIsLayoutManagerOpen(false)}
          />

          {(isStep1LockedView || isSynced) ? (
            <BuilderHeaderPanel
              draft={draft}
              token={token ?? null}
              locationRef={actions.selectedLocationRefId}
              mediaAssets={mediaAssets}
              updateHeader={actions.updateHeader}
              onIntroAiAutoWrite={aiActions.autoWriteIntro}
              isIntroAiGenerating={aiActions.activeAiTargetId === getItineraryIntroTargetId(draft)}
              introComposeDisabledReason={getItineraryIntroComposeDisabledReason(draft, relatedByBlockType)}
              hasIntroComposeReport={Boolean(aiActions.introComposeReport)}
              onViewIntroComposeReport={() => aiActions.setIsIntroComposeReportOpen(true)}
              isLocked={isStep2LockedView}
              isSynced={isSynced}
              onContinueStep2={actions.handleContinueStep2}
              onUpdateStep2={actions.handleUpdateStep2}
              onSaveStep2={actions.handleSaveStep2}
              onCancelStep2Update={actions.cancelUpdateStep2}
            />
          ) : null}

          <InspectIntroComposeRunModal
            isOpen={aiActions.isIntroComposeReportOpen}
            onClose={() => aiActions.setIsIntroComposeReportOpen(false)}
            report={aiActions.introComposeReport}
          />

          {(isStep1LockedView && isStep2LockedView) || isSynced ? (
            <>
              <BuilderDayTabs
                dayCount={draft.dayCount}
                activeDayIndex={activeDayIndex}
                dayIds={draft.days.map((day) => day.id)}
                onActiveDayChange={setActiveDayIndex}
              />
              <BuilderStopsPanel
                draft={draft}
                activeDayIndex={activeDayIndex}
                token={token ?? null}
                locationRef={actions.selectedLocationRefId}
                mediaAssets={mediaAssets}
                instagramPosts={instagramPosts}
                isLoadingRelated={isLoadingRelated}
                relatedByBlockType={relatedByBlockType}
                onAddWhereStaying={() => actions.addWhereStayingItem(activeDayIndex)}
                onAddItem={(insertIndex) => actions.addItem(activeDayIndex, insertIndex)}
                onMoveItem={actions.moveItem}
                onRemoveItem={actions.removeItem}
                onUpdateItem={actions.updateItem}
                onStopBlurbAiAutoWrite={aiActions.autoWriteStopBlurb}
                onRefineStopReason={aiActions.refineStopReason}
                activeAiItemId={aiActions.activeAiTargetId?.endsWith('_blurb') ? aiActions.activeAiTargetId.replace(/_blurb$/, '') : null}
                onComposeActiveDayBlurbs={() => aiActions.composeDayBlurbs(activeDayIndex)}
                onComposeAllDayBlurbs={aiActions.composeAllDayBlurbs}
                activeDayBlurbDisabledReason={getItineraryDayBlurbComposeDisabledReason(draft, activeDayIndex, relatedByBlockType)}
                composableDayCount={getComposableDayIndexes(draft, relatedByBlockType).length}
                isComposingDayBlurbs={aiActions.isComposingDayBlurbs}
                hasDayBlurbReport={Boolean(aiActions.dayBlurbReport)}
                onViewDayBlurbReport={() => aiActions.setIsDayBlurbReportOpen(true)}
                isLocked={isStep3LockedView}
                isSynced={isSynced}
                onContinueStep3={actions.handleContinueStep3}
                onUpdateStep3={actions.handleUpdateStep3}
                onSaveStep3={actions.handleSaveStep3}
                onCancelStep3Update={actions.cancelUpdateStep3}
              />

              <InspectDayBlurbComposeRunModal
                isOpen={aiActions.isDayBlurbReportOpen}
                onClose={() => aiActions.setIsDayBlurbReportOpen(false)}
                report={aiActions.dayBlurbReport}
              />

              <StopBlurbComposeChoiceModal
                isOpen={aiActions.stopComposeChoice !== null}
                stopTitle={aiActions.stopComposeChoice?.stopTitle ?? ''}
                dayNumber={(aiActions.stopComposeChoice?.dayIndex ?? 0) + 1}
                strandsNeighbor={aiActions.stopComposeChoice?.strandsNeighbor ?? false}
                disabled={aiActions.isComposingDayBlurbs}
                onJustThisStop={() => {
                  if (!aiActions.stopComposeChoice) return
                  const { dayIndex, targetId } = aiActions.stopComposeChoice
                  aiActions.setStopComposeChoice(null)
                  void aiActions.composeSingleStopAware(dayIndex, targetId)
                }}
                onWholeDay={() => {
                  if (!aiActions.stopComposeChoice) return
                  const { dayIndex } = aiActions.stopComposeChoice
                  aiActions.setStopComposeChoice(null)
                  void aiActions.executeDayBlurbCompose(dayIndex)
                }}
                onClose={() => aiActions.setStopComposeChoice(null)}
              />
            </>
          ) : null}

          {(isStep1LockedView && isStep2LockedView && isStep3LockedView) || isSynced ? (
            <BuilderSeoPanel
              draft={draft}
              setDraft={setDraft}
              onGenerateSeoWithAi={aiActions.generateSeoWithAi}
              isGeneratingSeoTarget={aiActions.isGeneratingSeoTarget}
              onGenerateSeoImageFromFeatured={aiActions.generateSeoImageFromFeatured}
              isGeneratingSeoImage={aiActions.isGeneratingSeoImage}
              onRegenerateStructuredData={aiActions.regenerateStructuredDataFromTemplate}
              canRegenerateStructuredData={Boolean(canonicalStructuredData)}
              onAutoFillOgUrl={aiActions.handleAutoFillOgUrl}
            />
          ) : null}

          {(isStep1LockedView && isStep2LockedView && isStep3LockedView) || isSynced ? (
            <BuilderPublishPanel
              draft={draft}
              isSaving={isSaving}
              onSaveLocalDraft={saveLocalDraft}
              onSyncToPayload={() => submit(syncTargetStatus)}
            />
          ) : null}
        </main>

        <BuilderSidebar
          completionPercent={progress.completionPercent}
          draft={draft}
          isSetupReady={progress.isSetupReady}
          editorModelName={draft.editorModelName}
          onEditorModelChange={actions.setEditorModelName}
          isSaving={isSaving}
          isRevertingToPayload={isRevertingToPayload}
          isAutoWritingEmptyFields={aiActions.isAutoWritingEmptyFields}
          canAutoWriteEmptyFields={Boolean((isSynced || (isStep1LockedView && isStep2LockedView)) && (getItineraryAutoWriteTargetIds(draft, relatedByBlockType).length > 0 || (!draft.header.introMarkdown.trim() && !getItineraryIntroComposeDisabledReason(draft, relatedByBlockType))))}
          stepIssues={progress.stepIssues}
          onAutoWriteEmptyFields={aiActions.autoWriteEmptyFields}
          onSaveLocalDraft={saveLocalDraft}
          onRevertToPayload={revertToPayloadVersion}
          onSyncToPayload={() => submit(syncTargetStatus)}
        />
      </div>
    </div>
  )
}
