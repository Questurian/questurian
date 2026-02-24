import type { DebugResponse } from '../../api'
import { getStage4Data } from '../../services/stage-data.selectors'

type TitleTabProps = {
  debugData?: DebugResponse
}

export function TitleTab({ debugData }: TitleTabProps) {
  const stage4Data = getStage4Data(debugData)
  if (!stage4Data) {
    return <p className="placeholder">No title yet. Finish Stage 5 to see results.</p>
  }

  return (
    <div className="title-result">
      <div className="generated-title">
        <strong>Generated Title:</strong>
        <h2 className="title-display">{stage4Data.title}</h2>
      </div>
    </div>
  )
}
