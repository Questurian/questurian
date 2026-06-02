import type { Prompt2BlogPipelinePayload } from '../api'
import type { PersistedRunState } from './pipeline-run.types'

export const RUN_STORAGE_KEY = 'p2b-run-state'

export function loadSavedRunState(): PersistedRunState {
  const fallback: PersistedRunState = {
    sourceStep: 'edit',
    pipelineRunId: null,
    pipelineResult: null,
  }
  try {
    const raw = localStorage.getItem(RUN_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PersistedRunState>
    const pipelineRunId = typeof parsed.pipelineRunId === 'string' ? parsed.pipelineRunId : null
    const pipelineResult =
      parsed.pipelineResult && typeof parsed.pipelineResult === 'object'
      && (parsed.pipelineResult as { quality_review?: unknown }).quality_review
        ? parsed.pipelineResult as Prompt2BlogPipelinePayload
        : null
    const sourceStep =
      parsed.sourceStep === 'pipeline_running' && pipelineRunId
        ? 'pipeline_running'
        : parsed.sourceStep === 'pipeline_complete' && pipelineRunId && pipelineResult
          ? 'pipeline_complete'
          : 'edit'

    return {
      sourceStep,
      pipelineRunId: sourceStep === 'edit' ? null : pipelineRunId,
      pipelineResult: sourceStep === 'pipeline_complete' ? pipelineResult : null,
    }
  } catch {
    return fallback
  }
}
