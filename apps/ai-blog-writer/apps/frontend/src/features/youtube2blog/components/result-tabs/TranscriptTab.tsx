import type { DebugResponse } from '../../api'
import { getStage1Data } from '../../services/stage-data.selectors'

type TranscriptTabProps = {
  debugData?: DebugResponse
}

export function TranscriptTab({ debugData }: TranscriptTabProps) {
  const stage1Data = getStage1Data(debugData)
  if (!stage1Data?.cleaned_transcript) {
    return <p className="placeholder">No transcript yet. Finish Stage 1 to see results.</p>
  }

  return (
    <div className="transcript-content">
      <pre>{stage1Data.cleaned_transcript}</pre>
    </div>
  )
}
