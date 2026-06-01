import { useState } from 'react'
import type { Url2BlogPipelineV2Response } from '../../types/pipeline.types'
import { PipelineTrace } from './PipelineTrace'

type DebugOutputProps = { debug: NonNullable<Url2BlogPipelineV2Response['debug']> }

export function DebugOutput({ debug }: DebugOutputProps) {
  const [showTrace, setShowTrace] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  return (
    <div className="u2b-content-section">
      <h3>Debug Output</h3>
      <div className="u2b-raw-toggle">
        <button type="button" className="url2blog-toggle-btn" onClick={() => setShowTrace(!showTrace)}>
          {showTrace ? 'Hide' : 'Show'} Stage Trace
        </button>
      </div>
      {showTrace && <PipelineTrace trace={debug.pipeline_trace ?? []} />}
      <div className="u2b-raw-toggle">
        <button type="button" className="url2blog-toggle-btn" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? 'Hide' : 'Show'} Full Debug JSON
        </button>
      </div>
      {showRaw && <div className="u2b-raw-json"><pre>{JSON.stringify(debug, null, 2)}</pre></div>}
    </div>
  )
}
