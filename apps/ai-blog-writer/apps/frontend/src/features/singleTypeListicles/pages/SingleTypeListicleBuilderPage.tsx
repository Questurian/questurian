import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { useSeoManager } from '../builder/hooks/useSeoManager'
import '../styles.css'

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

  if (isLoading || !draft) {
    return (
      <div className="stl-page">
        <p className="stl-placeholder">Loading builder...</p>
      </div>
    )
  }

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
          />

          <BuilderHeaderPanel draft={draft} mediaAssets={mediaAssets} updateHeader={actions.updateHeader} />

          <BuilderItemsPanel
            draft={draft}
            relatedItems={relatedItems}
            isLoadingRelated={isLoadingRelated}
            addItem={actions.addItem}
            moveItem={actions.moveItem}
            removeItem={actions.removeItem}
            updateItem={actions.updateItem}
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
            updateDraft={actions.updateDraft}
            onSaveDraft={() => submit('draft')}
            onPublish={() => submit('published')}
          />
        </main>

        <BuilderSidebar
          draft={draft}
          completionPercent={progress.completionPercent}
          isSetupReady={progress.isSetupReady}
          hasTargetCount={progress.hasTargetCount}
          stepIssues={progress.stepIssues}
          isSaving={isSaving}
          onSaveDraft={() => submit('draft')}
          onPublish={() => submit('published')}
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
