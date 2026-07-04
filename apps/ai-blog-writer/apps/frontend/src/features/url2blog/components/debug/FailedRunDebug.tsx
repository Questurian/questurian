import { useState } from 'react'
import type {
  Url2BlogDebugRunResponse,
  Url2BlogStageTrace,
} from '../../types/pipeline.types'
import { PipelineTrace } from './PipelineTrace'

type FailedRunDebugProps = { debug: Url2BlogDebugRunResponse }

type MissingFact = {
  fact_id?: string
  fact?: string
  priority?: string
  reason?: string
}

function extractTrace(debug: Url2BlogDebugRunResponse): Url2BlogStageTrace[] {
  const traceRecord = debug.stages?.pipeline_trace?.data
  const trace = traceRecord && (traceRecord as { trace?: unknown }).trace
  return Array.isArray(trace) ? (trace as Url2BlogStageTrace[]) : []
}

function extractGateRecords(debug: Url2BlogDebugRunResponse) {
  const gateStages = [
    'rewrite_quality_gate',
    'rewrite_quality_retry',
    'fact_gate',
    'fact_retry',
    'editorial_gate',
    'editorial_rollback',
  ]
  return gateStages
    .map((stage) => ({ stage, record: debug.stages?.[stage] }))
    .filter((entry) => Boolean(entry.record))
}

export function FailedRunDebug({ debug }: FailedRunDebugProps) {
  const [showTrace, setShowTrace] = useState(true)
  const [showStages, setShowStages] = useState(false)
  const trace = extractTrace(debug)
  const gateRecords = extractGateRecords(debug)
  const factGateData = (debug.stages?.fact_gate?.data ?? {}) as Record<string, unknown>
  const missingFacts = Array.isArray(factGateData.missing_facts)
    ? (factGateData.missing_facts as MissingFact[])
    : []
  const draftContent = typeof factGateData.draft_content === 'string' ? factGateData.draft_content : ''

  return (
    <div className="u2b-content-section u2b-failed-run-debug">
      <h3>Failed Run Debug</h3>
      <p className="u2b-trace-phase-description">
        Run {debug.run_id} failed at stage “{debug.status?.stage}”. Everything the pipeline
        recorded before dying is below.
      </p>

      {missingFacts.length > 0 && (
        <div className="u2b-trace-error">
          <strong>Facts the coverage judge flagged as missing:</strong>
          <ul>
            {missingFacts.map((fact, index) => (
              <li key={fact.fact_id ?? index}>
                <strong>{fact.fact_id}</strong> ({fact.priority}): {fact.fact}
                {fact.reason ? <em> — {fact.reason}</em> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {draftContent && (
        <details className="u2b-trace-block">
          <summary>Last draft before failure</summary>
          <div className="u2b-raw-json"><pre>{draftContent}</pre></div>
        </details>
      )}

      {gateRecords.length > 0 && (
        <div className="u2b-raw-toggle">
          <button type="button" className="url2blog-toggle-btn" onClick={() => setShowStages(!showStages)}>
            {showStages ? 'Hide' : 'Show'} Gate Decisions ({gateRecords.length})
          </button>
        </div>
      )}
      {showStages && gateRecords.map(({ stage, record }) => (
        <details key={stage} className="u2b-trace-block">
          <summary>{stage}</summary>
          <div className="u2b-raw-json"><pre>{JSON.stringify(record, null, 2)}</pre></div>
        </details>
      ))}

      <div className="u2b-raw-toggle">
        <button type="button" className="url2blog-toggle-btn" onClick={() => setShowTrace(!showTrace)}>
          {showTrace ? 'Hide' : 'Show'} Stage Trace ({trace.length} calls)
        </button>
      </div>
      {showTrace && <PipelineTrace trace={trace} />}
    </div>
  )
}
