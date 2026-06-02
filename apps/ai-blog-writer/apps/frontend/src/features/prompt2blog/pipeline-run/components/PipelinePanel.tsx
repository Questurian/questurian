import type { usePrompt2BlogPipelineRun } from '../hooks/usePrompt2BlogPipelineRun'
import { getPipelineStageMetadata } from '../pipeline-status'
import { PipelineResult } from './PipelineResult'

interface PipelinePanelProps {
  run: ReturnType<typeof usePrompt2BlogPipelineRun>
  onOpenCleanupModal: () => void
  onReset: () => void
}

export function PipelinePanel({ run, onOpenCleanupModal, onReset }: PipelinePanelProps) {
  const props = {
    canOpenCleanupModal: run.canOpenCleanupModal,
    debugData: run.pipelineDebugData,
    error: run.error,
    isLoading: run.isLoading,
    loadingLabel: run.loadingLabel,
    logs: run.pipelineLogs,
    result: run.pipelineResult,
    showDebug: run.showPipelineDebug,
    sourceStep: run.sourceStep,
    stageArticleUrl: run.stageArticleUrl,
    status: run.pipelineStatus,
    onOpenCleanupModal,
    onReset,
    onRun: () => void run.run(),
    onToggleDebug: run.togglePipelineDebug,
  }
  const stages = getPipelineStageMetadata(props.status, {
    canOpenCleanupModal: props.canOpenCleanupModal,
    onOpenCleanupModal: props.onOpenCleanupModal,
  })

  return (
    <section className="p2b-panel">
      <div className="p2b-panel-header">
        <h2>Pipeline</h2>
        <p>Run status and logs.</p>
      </div>
      <div className="p2b-panel-body">
        <div className="p2b-button-row">
          <button type="button" className="p2b-synthesize-btn" onClick={props.onRun}>
            Run Prompt2Blog Pipeline
          </button>
          <button type="button" className="p2b-rerun-btn" onClick={props.onReset}>
            Reset Run
          </button>
        </div>

        <div className="p2b-progress-grid">
          {stages.map(stage => {
            const className = `p2b-progress-item p2b-progress-item--${stage.status}${
              stage.interactive ? ' p2b-progress-item--interactive' : ''
            }`
            const content = (
              <>
                <strong>{stage.label}</strong>
                <span>{stage.status}</span>
                {stage.detailLabel && <small>{stage.detailLabel}</small>}
              </>
            )

            if (stage.interactive) {
              return (
                <button
                  key={stage.key}
                  type="button"
                  className={className}
                  onClick={stage.onClick}
                  aria-label={stage.ariaLabel}
                >
                  {content}
                </button>
              )
            }

            return (
              <div key={stage.key} className={className}>
                {content}
              </div>
            )
          })}
        </div>

        {props.logs.length > 0 && (
          <div className="p2b-raw-json">
            <pre>
              {props.logs
                .map(log => `[${log.at}] ${log.level.toUpperCase()}: ${log.message}`)
                .join('\n')}
            </pre>
          </div>
        )}

        {props.sourceStep === 'pipeline_complete' && props.result && (
          <PipelineResult
            debugData={props.debugData}
            result={props.result}
            showDebug={props.showDebug}
            stageArticleUrl={props.stageArticleUrl}
            onToggleDebug={props.onToggleDebug}
          />
        )}
      </div>

      {props.error && <div className="p2b-error">{props.error}</div>}
      {props.isLoading && (
        <div className="p2b-loading">
          <div className="p2b-spinner" />
          <span>{props.loadingLabel}</span>
        </div>
      )}
    </section>
  )
}
