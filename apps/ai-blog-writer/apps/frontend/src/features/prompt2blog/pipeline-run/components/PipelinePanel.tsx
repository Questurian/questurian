import type { usePrompt2BlogPipelineRun } from '../hooks/usePrompt2BlogPipelineRun'
import { CLEANUP_STAGE_KEY } from '../../cleanup-details/cleanup-stage.parser'
import type { PipelineStepStatus } from '../pipeline-run.types'
import {
  getPipelineStepStatus,
  PIPELINE_STAGE_LABELS,
  PROMPT2BLOG_STAGE_ORDERS,
} from '../pipeline-status'
import { NeedsResearchResult } from './NeedsResearchResult'
import { PipelineResult } from './PipelineResult'
import { PipelineV3Result } from './PipelineV3Result'

interface PipelinePanelProps {
  run: ReturnType<typeof usePrompt2BlogPipelineRun>
  onBackToResearch: () => void
  onOpenCleanupModal: () => void
  onReset: () => void
  submissionBlockedReason?: string | null
}

export function PipelinePanel({
  run,
  onBackToResearch,
  onOpenCleanupModal,
  onReset,
  submissionBlockedReason,
}: PipelinePanelProps) {
  const {
    canOpenCleanupModal,
    dismissNeedsResearch,
    error,
    hasStartedRun,
    isLoading,
    loadingLabel,
    needsResearch,
    pipelineDebugData,
    pipelineLogs,
    pipelineResult,
    pipelineStatus,
    pipelineVersion,
    showPipelineDebug,
    sourceStep,
    stageArticleUrl,
    togglePipelineDebug,
  } = run
  const stageOrder = PROMPT2BLOG_STAGE_ORDERS[pipelineVersion]

  return (
    <section className="p2b-panel">
      <div className="p2b-panel-header">
        <h2>Pipeline</h2>
        <p>Run status and logs.</p>
      </div>
      <div className="p2b-panel-body">
        <div className="p2b-button-row">
          <button
            type="button"
            className="p2b-synthesize-btn"
            disabled={Boolean(submissionBlockedReason)}
            onClick={() => void run.run()}
          >
            Run Prompt2Blog Pipeline
          </button>
          <button type="button" className="p2b-rerun-btn" onClick={onReset}>
            Reset Run
          </button>
        </div>
        {submissionBlockedReason && (
          <p className="p2b-field-hint" role="status">
            {submissionBlockedReason}
          </p>
        )}

        <div className="p2b-progress-grid">
          {stageOrder.map(step => (
            <PipelineStageItem
              key={step}
              action={
                step === CLEANUP_STAGE_KEY && canOpenCleanupModal ? onOpenCleanupModal : undefined
              }
              label={PIPELINE_STAGE_LABELS[step]}
              status={getPipelineStepStatus(step, pipelineStatus, stageOrder, hasStartedRun)}
            />
          ))}
          {pipelineStatus?.stage === 'unknown' && (
            <PipelineStageItem
              label={
                pipelineStatus.raw_stage ? `Unknown: ${pipelineStatus.raw_stage}` : 'Unknown stage'
              }
              status={pipelineStatus.state === 'failed' ? 'failed' : 'running'}
            />
          )}
        </div>

        {pipelineLogs.length > 0 && (
          <div className="p2b-raw-json">
            <pre>
              {pipelineLogs
                .map(log => `[${log.at}] ${log.level.toUpperCase()}: ${log.message}`)
                .join('\n')}
            </pre>
          </div>
        )}

        {needsResearch && (
          <NeedsResearchResult
            result={needsResearch}
            onBackToResearch={onBackToResearch}
            onDismiss={dismissNeedsResearch}
          />
        )}

        {sourceStep === 'pipeline_complete' && pipelineResult && (
          pipelineResult.version === 'v3' ? (
            <PipelineV3Result
              debugData={pipelineDebugData}
              result={pipelineResult.payload}
              showDebug={showPipelineDebug}
              stageArticleUrl={stageArticleUrl}
              onToggleDebug={togglePipelineDebug}
            />
          ) : (
            <PipelineResult
              debugData={pipelineDebugData}
              result={pipelineResult.payload}
              showDebug={showPipelineDebug}
              stageArticleUrl={stageArticleUrl}
              onToggleDebug={togglePipelineDebug}
            />
          )
        )}
      </div>

      {error && <div className="p2b-error">{error}</div>}
      {isLoading && (
        <div className="p2b-loading">
          <div className="p2b-spinner" />
          <span>{loadingLabel}</span>
        </div>
      )}
    </section>
  )
}

function PipelineStageItem({
  action,
  label,
  status,
}: {
  action?: () => void
  label: string
  status: PipelineStepStatus
}) {
  const className = `p2b-progress-item p2b-progress-item--${status}${
    action ? ' p2b-progress-item--interactive' : ''
  }`
  const content = (
    <>
      <strong>{label}</strong>
      <span>{status}</span>
      {action && <small>View details</small>}
    </>
  )

  if (action) {
    return (
      <button
        type="button"
        className={className}
        onClick={action}
        aria-label="View clean source material details"
      >
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}
