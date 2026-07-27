import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { CleanupDetailsModal } from '../cleanup-details/CleanupDetailsModal'
import { useCleanupDetailsModal } from '../cleanup-details/hooks/useCleanupDetailsModal'
import { CoreInputsPanel } from '../composer/components/CoreInputsPanel'
import { GuidelinePreviewPanel } from '../composer/components/GuidelinePreviewPanel'
import { PromptProfilesPanel } from '../composer/components/PromptProfilesPanel'
import { SeoConstraintsPanel } from '../composer/components/SeoConstraintsPanel'
import { SourceMaterialPanel } from '../composer/components/SourceMaterialPanel'
import { usePrompt2BlogComposer } from '../composer/hooks/usePrompt2BlogComposer'
import { PipelinePanel } from '../pipeline-run/components/PipelinePanel'
import { usePrompt2BlogPipelineRun } from '../pipeline-run/hooks/usePrompt2BlogPipelineRun'
import '../styles.css'

export default function Prompt2BlogPage() {
  const composer = usePrompt2BlogComposer()
  const pipeline = usePrompt2BlogPipelineRun(composer.payload)
  const cleanupModal = useCleanupDetailsModal({
    pipelineRunId: pipeline.pipelineRunId,
    pipelineDebugData: pipeline.pipelineDebugData,
    onDebugData: pipeline.setPipelineDebugData,
  })
  const [copied, setCopied] = useState(false)
  const { state } = composer

  const handleCopyJson = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(composer.payload, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      pipeline.setError('Unable to copy JSON to clipboard.')
    })
  }, [composer.payload, pipeline])

  const handleResetRun = useCallback(() => {
    cleanupModal.close()
    pipeline.reset()
  }, [cleanupModal, pipeline])

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
            Choose article type, set voice controls, paste source material, and run the full guideline-aware pipeline.
          </p>
        </div>
        <div className="p2b-badge-row">
          <Link to="/" className="p2b-nav-link">&larr; Home</Link>
          <Link to="/prompt2blog/articles" className="p2b-nav-link">Saved Articles</Link>
        </div>
      </header>

      <main className="p2b-form-container">
        <form className="p2b-form" onSubmit={(event) => event.preventDefault()}>
          <CoreInputsPanel
            angle={state.angle}
            articleGoal={state.articleGoal}
            articleTypeId={state.articleTypeId}
            callToAction={state.callToAction}
            destinationContext={state.destinationContext}
            groupedOptions={composer.groupedArticleTypeOptions}
            quickPicks={composer.articleTypeQuickPicks}
            selectedArticleType={composer.selectedArticleType}
            targetReader={state.targetReader}
            onAngleChange={value => composer.updateField('angle', value)}
            onArticleGoalChange={value => composer.updateField('articleGoal', value)}
            onArticleTypeChange={value => composer.updateField('articleTypeId', value)}
            onCallToActionChange={value => composer.updateField('callToAction', value)}
            onClear={composer.clearCoreInputs}
            onDestinationContextChange={value => composer.updateField('destinationContext', value)}
            onTargetReaderChange={value => composer.updateField('targetReader', value)}
          />
          <PromptProfilesPanel
            audienceProfile={state.audienceProfile}
            brandVoiceId={state.brandVoiceId}
            creativityLevel={state.creativityLevel}
            enableEditorialAugmentation={state.enableEditorialAugmentation}
            inputOptions={composer.inputOptions}
            lengthId={state.lengthId}
            modelName={state.modelName}
            writingModel={state.writingModel}
            negativeInstructions={state.negativeInstructions}
            promptEnhance={state.promptEnhance}
            toneId={state.toneId}
            onChange={composer.updateField}
            onClear={composer.clearPromptProfiles}
          />
          <SeoConstraintsPanel
            mustInclude={state.mustInclude}
            primaryKeyword={state.primaryKeyword}
            secondaryKeywords={state.secondaryKeywords}
            onClear={composer.clearSeoConstraints}
            onMustIncludeChange={value => composer.updateField('mustInclude', value)}
            onPrimaryKeywordChange={value => composer.updateField('primaryKeyword', value)}
            onSecondaryKeywordsChange={value => composer.updateField('secondaryKeywords', value)}
          />
          <SourceMaterialPanel
            blobs={state.blobs}
            onAdd={composer.addBlob}
            onClear={composer.clearSourceMaterial}
            onRemove={composer.removeBlob}
            onUpdate={composer.updateBlob}
          />
          <GuidelinePreviewPanel
            loading={composer.guidelineLoading}
            preview={composer.guidelinePreview}
          />
          <PipelinePanel
            run={pipeline}
            onOpenCleanupModal={() => void cleanupModal.open()}
            onReset={handleResetRun}
          />

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

      {cleanupModal.isOpen && <CleanupDetailsModal
        data={cleanupModal.data}
        error={cleanupModal.error}
        loading={cleanupModal.isLoading}
        onClose={cleanupModal.close}
      />}
    </div>
  )
}
