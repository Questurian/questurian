import type { PersistedPipelineResult, PersistedRunState } from './pipeline-run.types'

export const RUN_STORAGE_KEY = 'p2b-run-state'

// The pipeline payload carries `debug.pipeline_trace`: one entry per stage,
// each holding that stage's full prompt and raw LLM response. That is megabytes
// for a normal run and blows past the ~5MB localStorage quota. Nothing renders
// it — the debug panel reads the separate /debug endpoint — so it is dropped
// before persisting.
function stripDebugPayload(
  pipelineResult: PersistedPipelineResult | null,
): PersistedPipelineResult | null {
  if (!pipelineResult) return null
  const { debug: _debug, ...persistable } = pipelineResult.payload
  return { version: pipelineResult.version, payload: persistable } as PersistedPipelineResult
}

function writeRunState(state: PersistedRunState): boolean {
  try {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clearRunState(): void {
  try {
    localStorage.removeItem(RUN_STORAGE_KEY)
  } catch {
    // Storage is unavailable, so there is nothing persisted to clear.
  }
}

export function saveRunState(state: PersistedRunState): void {
  const persistable: PersistedRunState = {
    ...state,
    pipelineResult: stripDebugPayload(state.pipelineResult),
  }
  if (writeRunState(persistable)) return

  // Still over quota (an unusually long article, or other keys filling the
  // origin). Persisting the run id alone keeps a *running* pipeline resumable;
  // a completed run degrades to the edit step on reload, which loadSavedRunState
  // already handles. Losing the resume is better than throwing out of the
  // effect and taking the page down with it.
  if (writeRunState({ ...persistable, pipelineResult: null })) return

  // Nothing fits. Drop the stale entry so the next reload starts clean rather
  // than restoring a half-written run.
  clearRunState()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Reads a persisted result in either the tagged shape or the untagged v2 shape
 * written before v3 existed. An untagged entry is a v2 run by definition, so it
 * is adopted rather than discarded: a completed run in a still-open tab must
 * survive the upgrade.
 */
function normalizePersistedResult(value: unknown): PersistedPipelineResult | null {
  if (!isRecord(value)) return null

  if (value.version === 'v2' || value.version === 'v3') {
    const payload = value.payload
    if (!isRecord(payload) || !payload.quality_review) return null
    return { version: value.version, payload } as PersistedPipelineResult
  }

  if (!value.quality_review) return null
  return { version: 'v2', payload: value } as PersistedPipelineResult
}

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
    const pipelineResult = normalizePersistedResult(parsed.pipelineResult)
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
