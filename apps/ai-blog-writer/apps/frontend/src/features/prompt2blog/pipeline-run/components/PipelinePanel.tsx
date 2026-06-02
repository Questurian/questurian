import type { Prompt2BlogPipelinePayload, Prompt2BlogStatusResponse } from '../../api'
import { CLEANUP_STAGE_KEY } from '../../cleanup-details/cleanup-stage.parser'
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGE_ORDER, getPipelineStepStatus } from '../pipeline-status'
import type { PipelineLogEntry, SourceStep } from '../pipeline-run.types'
import { PipelineResult } from './PipelineResult'

interface PipelinePanelProps {
  canOpenCleanupModal: boolean
  debugData: Record<string, unknown> | null
  error: string | null
  isLoading: boolean
  loadingLabel: string
  logs: PipelineLogEntry[]
  result: Prompt2BlogPipelinePayload | null
  showDebug: boolean
  sourceStep: SourceStep
  stageArticleUrl: string | null
  status: Prompt2BlogStatusResponse | null
  onOpenCleanupModal: () => void
  onReset: () => void
  onRun: () => void
  onToggleDebug: () => void
}

export function PipelinePanel(props: PipelinePanelProps) {
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
          {PIPELINE_STAGE_ORDER.map(step => {
            const status = getPipelineStepStatus(step, props.status)

            if (step === CLEANUP_STAGE_KEY && props.canOpenCleanupModal) {
              return (
                <button
                  key={step}
                  type="button"
                  className={`p2b-progress-item p2b-progress-item--${status} p2b-progress-item--interactive`}
                  onClick={props.onOpenCleanupModal}
                  aria-label="View clean source material details"
                >
                  <strong>{PIPELINE_STAGE_LABELS[step] || step}</strong>
                  <span>{status}</span>
                  <small>View details</small>
                </button>
              )
            }

            return (
              <div key={step} className={`p2b-progress-item p2b-progress-item--${status}`}>
                <strong>{PIPELINE_STAGE_LABELS[step] || step}</strong>
                <span>{status}</span>
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
