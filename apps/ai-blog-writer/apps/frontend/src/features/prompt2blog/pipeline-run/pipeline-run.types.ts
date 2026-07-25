import type { Prompt2BlogPipelinePayload } from '../api'
import type { PipelineStepState } from '../../pipelineRuns'

export type SourceStep = 'edit' | 'pipeline_running' | 'pipeline_complete'
export type PipelineStepStatus = PipelineStepState
export type PipelineLogLevel = 'info' | 'error'

export interface PersistedRunState {
  sourceStep: SourceStep
  pipelineRunId: string | null
  pipelineResult: Prompt2BlogPipelinePayload | null
}

export interface PipelineLogEntry {
  id: number
  at: string
  level: PipelineLogLevel
  message: string
}
