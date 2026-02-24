import type { StatusResponse } from '@shared/types'

import { getStageItemState, getStageLabel, getStagePhase } from '../utils/pipeline-status.utils'

type StatusPanelProps = {
  status: StatusResponse
  runInputType?: 'url' | null
}

export function StatusPanel({ status, runInputType = null }: StatusPanelProps) {
  const stageLabel = getStageLabel(status)
  const stageOneState = getStageItemState(status, 1)
  const stageTwoState = getStageItemState(status, 2)
  const stageThreeState = getStageItemState(status, 3)
  const stageFourState = getStageItemState(status, 4)
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
          <div className={`stage-item ${stageOneState}`}>
            <span className="stage-dot" />
            <span>Stage 1 - ({getStagePhase(status, 1)})</span>
          </div>
          <div className={`stage-item ${stageTwoState}`}>
            <span className="stage-dot" />
            <span>Stage 2 - ({getStagePhase(status, 2)})</span>
          </div>
          <div className={`stage-item ${stageThreeState}`}>
            <span className="stage-dot" />
            <span>Stage 3 - ({getStagePhase(status, 3)})</span>
          </div>
          <div className={`stage-item ${stageFourState}`}>
            <span className="stage-dot" />
            <span>Stage 4 - ({getStagePhase(status, 4)})</span>
          </div>
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
