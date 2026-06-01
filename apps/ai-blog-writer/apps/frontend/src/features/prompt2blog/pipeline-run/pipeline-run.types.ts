import type { Prompt2BlogPipelinePayload } from '../api'

export type SourceStep = 'edit' | 'pipeline_running' | 'pipeline_complete'
export type PipelineStepStatus = 'pending' | 'running' | 'done' | 'error'
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
