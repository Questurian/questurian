import type { Url2BlogStageTrace } from '../../types/pipeline.types'
import {
  getTraceStatus,
  getTraceStatusLabel,
  groupPipelineTrace,
} from '../../utils/pipeline-trace.utils'

type PipelineTraceProps = { trace: Url2BlogStageTrace[] }

export function PipelineTrace({ trace }: PipelineTraceProps) {
  const groupedTrace = groupPipelineTrace(trace)
  if (groupedTrace.length === 0) {
    return <div className="u2b-guideline-text">No stage trace is available for this run.</div>
  }

  return (
    <div className="u2b-trace-phase-list">
      {groupedTrace.map((phaseGroup, phaseIndex) => (
        <details key={phaseGroup.phase.key} className="u2b-trace-phase" open={phaseIndex === 0}>
          <summary>{phaseGroup.phase.title} ({phaseGroup.calls.length} call{phaseGroup.calls.length === 1 ? '' : 's'})</summary>
          <p className="u2b-trace-phase-description">{phaseGroup.phase.description}</p>
          <div className="u2b-trace-call-list">
            {phaseGroup.calls.map(({ entry, index, callLabel }) => (
              <TraceCall key={`${entry.stage}-${index}`} entry={entry} index={index} callLabel={callLabel} />
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

function TraceCall({ entry, index, callLabel }: { entry: Url2BlogStageTrace; index: number; callLabel: string }) {
  const status = getTraceStatus(entry)
  return (
    <details className="u2b-trace-call">
      <summary>
        <span className="u2b-trace-call-title">Call {index + 1}: {callLabel}</span>
        <span className={`u2b-trace-status u2b-trace-status--${status}`}>{getTraceStatusLabel(status)}</span>
      </summary>
      <div className="u2b-trace-meta">
        <span>Stage ID: {entry.stage}</span>
        {entry.model_name && <span>Model: {entry.model_name}</span>}
        {typeof entry.max_tokens === 'number' && <span>Max tokens: {entry.max_tokens}</span>}
        {typeof entry.temperature === 'number' && <span>Temperature: {entry.temperature}</span>}
      </div>
      {entry.error && <div className="u2b-trace-error"><strong>Error:</strong> {entry.error}</div>}
      {entry.input !== undefined && <TraceBlock label="Input" value={entry.input} json />}
      {entry.prompt && <TraceBlock label="Prompt" value={entry.prompt} />}
      {entry.raw_response && <TraceBlock label="Raw Response" value={entry.raw_response} />}
      {entry.parsed !== undefined && <TraceBlock label="Parsed" value={entry.parsed} json />}
      {entry.output !== undefined && <TraceBlock label="Output" value={entry.output} json />}
      {entry.grounded_urls && entry.grounded_urls.length > 0 && <TraceBlock label="Grounded URLs" value={entry.grounded_urls} json />}
    </details>
  )
}

function TraceBlock({ label, value, json = false }: { label: string; value: unknown; json?: boolean }) {
  return (
    <details className="u2b-trace-block">
      <summary>{label}</summary>
      <div className="u2b-raw-json"><pre>{json ? JSON.stringify(value, null, 2) : String(value)}</pre></div>
    </details>
  )
}
