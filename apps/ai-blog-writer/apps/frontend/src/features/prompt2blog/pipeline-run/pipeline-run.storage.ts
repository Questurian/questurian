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
    return {
      sourceStep:
        parsed.sourceStep === 'pipeline_running' || parsed.sourceStep === 'pipeline_complete'
          ? parsed.sourceStep
          : 'edit',
      pipelineRunId: typeof parsed.pipelineRunId === 'string' ? parsed.pipelineRunId : null,
      pipelineResult:
        parsed.pipelineResult && typeof parsed.pipelineResult === 'object'
        && (parsed.pipelineResult as { quality_review?: unknown }).quality_review
          ? parsed.pipelineResult as Prompt2BlogPipelinePayload
          : null,
    }
  } catch {
    return fallback
  }
}
