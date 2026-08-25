import type { Prompt2BlogPipelinePayload, Prompt2BlogV3PipelinePayload } from '../api'
import type { PipelineStepState } from '../../pipelineRuns'

export type SourceStep = 'edit' | 'pipeline_running' | 'pipeline_complete'
export type PipelineStepStatus = PipelineStepState
export type PipelineLogLevel = 'info' | 'error'
export type PipelineVersion = 'v2' | 'v3'

/**
 * A finished run tagged with the pipeline that produced it. The two payloads
 * are different shapes, not one shape with optional halves, so the tag is what
 * lets a v2 result from last month and a v3 result from today both render.
 */
export type PersistedPipelineResult =
  | { version: 'v2'; payload: Prompt2BlogPipelinePayload }
  | { version: 'v3'; payload: Prompt2BlogV3PipelinePayload }

export interface PersistedRunState {
  sourceStep: SourceStep
  pipelineRunId: string | null
  pipelineResult: PersistedPipelineResult | null
}

export interface PipelineLogEntry {
  id: number
  at: string
  level: PipelineLogLevel
  message: string
}
