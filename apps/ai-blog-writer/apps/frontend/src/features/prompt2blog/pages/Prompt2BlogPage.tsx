import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CleanupDetailsModal } from '../cleanup-details/CleanupDetailsModal'
import { useCleanupDetailsModal } from '../cleanup-details/hooks/useCleanupDetailsModal'
import { EasySetupPanel } from '../composer/components/EasySetupPanel'
import { FoldedSection } from '../composer/components/FoldedSection'
import { ModelRoutingPanel } from '../composer/components/ModelRoutingPanel'
import { StepRail } from '../composer/components/StepRail'
import { PromptProfilesPanel } from '../composer/components/PromptProfilesPanel'
import { usePrompt2BlogComposer } from '../composer/hooks/usePrompt2BlogComposer'
import { deriveP2BSteps } from '../composer/step-model'
import { PipelinePanel } from '../pipeline-run/components/PipelinePanel'
import { usePrompt2BlogPipelineRun } from '../pipeline-run/hooks/usePrompt2BlogPipelineRun'
import '../styles.css'

export default function Prompt2BlogPage() {
  const composer = usePrompt2BlogComposer()
  const pipeline = usePrompt2BlogPipelineRun({
    v3Payload: composer.v3Payload,
    v3BlockedReason: composer.submissionBlockedReason,
  })
  const cleanupModal = useCleanupDetailsModal({
    pipelineRunId: pipeline.pipelineRunId,
    pipelineDebugData: pipeline.pipelineDebugData,
    onDebugData: pipeline.setPipelineDebugData,
  })
  const [copied, setCopied] = useState(false)
  const { state } = composer
  const steps = useMemo(() => deriveP2BSteps(state), [state])

  const handleCopyJson = useCallback(() => {
    navigator.clipboard
      .writeText(JSON.stringify(composer.v3Payload, null, 2))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        pipeline.setError('Unable to copy JSON to clipboard.')
      })
  }, [composer.v3Payload, pipeline])

  const handleResetRun = useCallback(() => {
    cleanupModal.close()
    pipeline.reset()
  }, [cleanupModal, pipeline])

  // The research step is already on the page; a stopped run needs the user
  // taken back to the box that accepts a replacement package, not a new screen.
  const handleBackToResearch = useCallback(() => {
    const evidenceField = document.getElementById('p2b-evidence-json')
    evidenceField?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (evidenceField instanceof HTMLTextAreaElement) evidenceField.focus()
  }, [])

  const handleClear = useCallback(() => {
    composer.clearAll()
    handleResetRun()
  }, [composer, handleResetRun])

  return (
    <div className="p2b-page">
      <header className="p2b-hero">
        <div>
          <p className="p2b-eyebrow">Questurian Studio</p>
          <h1>
            Craft articles from <span className="p2b-underline-text">structured input</span>
            <span className="p2b-dot">.</span>
          </h1>
          <p className="p2b-lede">
            Approve one editorial commission, research it, and run the commission-driven
            pipeline.
          </p>
        </div>
        <div className="p2b-badge-row">
          <Link to="/" className="p2b-nav-link">
            &larr; Home
          </Link>
          <Link to="/prompt2blog/articles" className="p2b-nav-link">
            Saved Articles
          </Link>
        </div>
      </header>

      <main className="p2b-form-container">
        <StepRail steps={steps} />
        <form className="p2b-form" onSubmit={event => event.preventDefault()}>
          <EasySetupPanel
            activeWorkflow={state.activeWorkflow}
            editorial={state.editorial}
            editorialOptions={composer.editorialOptions}
            editorialOptionsError={composer.editorialOptionsError}
            editorialOptionsLoading={composer.editorialOptionsLoading}
            location={state.easySetupLocation}
            steps={steps}
            title={state.easySetupTitle}
            onApplyDirectionResponse={composer.applyDirectionResponse}
            onApproveCommission={composer.approveCommissionChanges}
            onClearDirectionWorkflow={composer.clearDirectionWorkflow}
            onClearEvidence={composer.clearEvidence}
            onCommissionChange={composer.updateCommissionDraft}
            onConfirmCommissionReview={composer.confirmCommissionReview}
            onLocationChange={value => composer.updateField('easySetupLocation', value)}
            onRetryEditorialOptions={composer.retryEditorialOptions}
            onSelectDirection={composer.selectDirectionOption}
            onStartDirectionWorkflow={composer.startDirectionWorkflow}
            onStoreEvidence={composer.storeEvidence}
            onTitleChange={value => composer.updateField('easySetupTitle', value)}
          />
          <PromptProfilesPanel
            brandVoiceId={state.brandVoiceId}
            creativityLevel={state.creativityLevel}
            inputOptions={composer.inputOptions}
            lengthId={state.lengthId}
            toneId={state.toneId}
            onChange={composer.updateField}
            onClear={composer.clearPromptProfiles}
          />
          <PipelinePanel
            run={pipeline}
            onBackToResearch={handleBackToResearch}
            onOpenCleanupModal={() => void cleanupModal.open()}
            onReset={handleResetRun}
            submissionBlockedReason={composer.submissionBlockedReason}
          />

          <FoldedSection
            title="Advanced"
            description="Which models run the pipeline, and what they cost."
          >
            <ModelRoutingPanel
              modelStackId={state.modelStackId}
              onChange={composer.applyModelStack}
              onClear={composer.clearModelRouting}
            />
          </FoldedSection>

          <div className="p2b-submit-row">
            <button type="button" className="p2b-copy-json-btn" onClick={handleCopyJson}>
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
            <button type="button" className="p2b-clear-btn" onClick={handleClear}>
              Clear All
            </button>
          </div>
        </form>
      </main>

      {cleanupModal.isOpen && (
        <CleanupDetailsModal
          data={cleanupModal.data}
          error={cleanupModal.error}
          loading={cleanupModal.isLoading}
          onClose={cleanupModal.close}
        />
      )}
    </div>
  )
}
