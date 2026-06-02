import type { usePrompt2BlogPipelineRun } from '../hooks/usePrompt2BlogPipelineRun'
import { CLEANUP_STAGE_KEY } from '../../cleanup-details/cleanup-stage.parser'
import type { PipelineStepStatus } from '../pipeline-run.types'
import { PROMPT2BLOG_PIPELINE_STAGES } from '../../types/pipeline.types'
import { getPipelineStepStatus, PIPELINE_STAGE_LABELS } from '../pipeline-status'
import { PipelineResult } from './PipelineResult'

interface PipelinePanelProps {
  run: ReturnType<typeof usePrompt2BlogPipelineRun>
  onOpenCleanupModal: () => void
  onReset: () => void
}

export function PipelinePanel({ run, onOpenCleanupModal, onReset }: PipelinePanelProps) {
  const {
    canOpenCleanupModal,
    error,
    isLoading,
    loadingLabel,
    pipelineDebugData,
    pipelineLogs,
    pipelineResult,
    pipelineStatus,
    showPipelineDebug,
    sourceStep,
    stageArticleUrl,
    togglePipelineDebug,
  } = run

  return (
    <section className="p2b-panel">
      <div className="p2b-panel-header">
        <h2>Pipeline</h2>
        <p>Run status and logs.</p>
      </div>
      <div className="p2b-panel-body">
        <div className="p2b-button-row">
          <button type="button" className="p2b-synthesize-btn" onClick={() => void run.run()}>
            Run Prompt2Blog Pipeline
          </button>
          <button type="button" className="p2b-rerun-btn" onClick={onReset}>
            Reset Run
          </button>
        </div>

        <div className="p2b-progress-grid">
          {PROMPT2BLOG_PIPELINE_STAGES.map(step => (
            <PipelineStageItem
              key={step}
              action={step === CLEANUP_STAGE_KEY && canOpenCleanupModal ? onOpenCleanupModal : undefined}
              label={PIPELINE_STAGE_LABELS[step]}
              status={getPipelineStepStatus(step, pipelineStatus)}
            />
          ))}
          {pipelineStatus?.stage === 'unknown' && (
            <PipelineStageItem
              label={pipelineStatus.raw_stage ? `Unknown: ${pipelineStatus.raw_stage}` : 'Unknown stage'}
              status={pipelineStatus.state === 'failed' ? 'error' : 'running'}
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

        {sourceStep === 'pipeline_complete' && pipelineResult && (
          <PipelineResult
            debugData={pipelineDebugData}
            result={pipelineResult}
            showDebug={showPipelineDebug}
            stageArticleUrl={stageArticleUrl}
            onToggleDebug={togglePipelineDebug}
          />
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

  return (
    <div className={className}>
      {content}
    </div>
  )
}
