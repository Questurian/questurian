import type { StatusResponse } from '@shared/types'

import { PIPELINE_TIMELINE } from '../constants/pipeline.constants'
import { getStageItemState, getStageLabel, getStagePhase } from '../utils/pipeline-status.utils'

type StatusPanelProps = {
  status: StatusResponse
  runInputType?: 'url' | null
}

export function StatusPanel({ status, runInputType = null }: StatusPanelProps) {
  const stageLabel = getStageLabel(status)
  const transcriptCaptured =
    runInputType === 'url' && status.stage !== 'stage_0' && status.state !== 'failed'

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Pipeline status</p>
          <h2>{stageLabel}</h2>
          <p className={`status ${status.state}`}>{status.state}</p>
        </div>
      </div>
      <div className="panel-body">
        {status.error ? <p className="error">{status.error}</p> : null}
        {transcriptCaptured ? (
          <p className="transcript-success-banner">
            Transcript captured from YouTube. Stage 1 started successfully.
          </p>
        ) : null}
        <div className="stage-checklist">
          {PIPELINE_TIMELINE.map((step) => {
            const itemState = getStageItemState(status, step)
            return (
              <div key={step.key} className={`stage-item ${itemState}`}>
                <span className="stage-dot" />
                <span>
                  {step.label} - ({getStagePhase(status, step)})
                </span>
              </div>
            )
          })}
        </div>
        {status.evaluation_metrics ? (
          <div className="metrics">
            {Object.entries(status.evaluation_metrics).map(([key, value]) => (
              <div key={key} className="metric">
                <span>{key}</span>
                <strong>{value.toFixed(3)}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
