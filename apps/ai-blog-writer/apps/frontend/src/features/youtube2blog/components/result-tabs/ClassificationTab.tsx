import type { DebugResponse } from '../../api'
import { getStage2Data } from '../../services/stage-data.selectors'

type ClassificationTabProps = {
  debugData?: DebugResponse
}

export function ClassificationTab({ debugData }: ClassificationTabProps) {
  const stage2Data = getStage2Data(debugData)
  if (!stage2Data) {
    return <p className="placeholder">No classification yet. Finish Stage 2 to see results.</p>
  }

  const confidence = stage2Data.confidence ?? 0

  return (
    <div className="classification-result">
      <div className="classification-type">{stage2Data.classification}</div>
      <div className="confidence-section">
        <span className="confidence-label">Confidence: {Math.round(confidence * 100)}%</span>
        <progress className="confidence-progress" max={100} value={confidence * 100} />
      </div>
      {stage2Data.reasoning ? <p className="reasoning">"{stage2Data.reasoning}"</p> : null}
    </div>
  )
}
