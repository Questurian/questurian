/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRunState,
  loadSavedRunState,
  RUN_STORAGE_KEY,
  saveRunState,
} from './pipeline-run.storage'
import type { PersistedRunState } from './pipeline-run.types'
import type { Prompt2BlogPipelinePayload, Prompt2BlogV3PipelinePayload } from '../api'

function buildPipelineResult(): Prompt2BlogPipelinePayload {
  return {
    message: 'ok',
    run_id: 'run-1',
    pipeline_status: 'ready_for_staging',
    article_type: { id: 1, name: 'How-to', definition: 'A how-to guide' },
    guideline_meta: { guideline: 'Be useful', title_guideline: 'Be clear' },
    improved_article: { title: 'Title', content: 'Content' },
    final_markdown: '# Title',
    quality_review: { quality_summary: 'Good' },
    debug: {
      pipeline_input: {
        article_type_id: 1,
        model_name: 'gemini-2.5-pro',
        include_debug: true,
        raw_sources_count: 1,
      },
      writing_brief: {},
      pipeline_trace: [
        { stage: 'stage_compose', prompt: 'x'.repeat(64), raw_response: 'y'.repeat(64) },
      ],
    },
  } as unknown as Prompt2BlogPipelinePayload
}

function buildV3PipelineResult(): Prompt2BlogV3PipelinePayload {
  return {
    message: 'ok',
    run_id: 'run-3',
    schema_version: 3,
    status: 'completed',
    pipeline_status: 'ready_for_staging',
    readiness_blockers: [],
    commission: { original_title: 'Is Lima still a bargain?', form_id: 'analysis' },
    form: { id: 'analysis', label: 'Analysis' },
    instruction_meta: { form_label: 'Analysis' },
    evidence_receipt: { source_ids: ['s1'], claim_ids: ['c1'] },
    improved_article: { title: 'Title', content: 'Content' },
    final_markdown: '# Lima',
    quality_review: { quality_summary: 'Good' },
    debug: {
      pipeline_input: {},
      instruction_text: 'x'.repeat(64),
      evidence_records: 'y'.repeat(64),
      pipeline_trace: [{ stage: 'stage_v3_compose', prompt: 'x'.repeat(64) }],
    },
  } as unknown as Prompt2BlogV3PipelinePayload
}

function completedRun(): PersistedRunState {
  return {
    sourceStep: 'pipeline_complete',
    pipelineRunId: 'run-1',
    pipelineResult: { version: 'v2', payload: buildPipelineResult() },
  }
}

function readPersisted(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(RUN_STORAGE_KEY) as string)
}

describe('saveRunState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persists the run without the debug trace', () => {
    saveRunState(completedRun())

    const persisted = readPersisted()
    const pipelineResult = persisted.pipelineResult as Record<string, unknown>
    const payload = pipelineResult.payload as Record<string, unknown>
    expect(pipelineResult.version).toBe('v2')
    expect(payload).not.toHaveProperty('debug')
    expect(payload.final_markdown).toBe('# Title')
    expect(localStorage.getItem(RUN_STORAGE_KEY)).not.toContain('pipeline_trace')
  })

  it('restores a completed run persisted without its debug trace', () => {
    saveRunState(completedRun())

    const loaded = loadSavedRunState()
    expect(loaded.sourceStep).toBe('pipeline_complete')
    expect(loaded.pipelineRunId).toBe('run-1')
    expect(loaded.pipelineResult?.payload.final_markdown).toBe('# Title')
  })

  it('leaves a running pipeline resumable when the result exceeds the quota', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setItem.mockImplementationOnce(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })

    saveRunState({
      sourceStep: 'pipeline_running',
      pipelineRunId: 'run-1',
      pipelineResult: { version: 'v2', payload: buildPipelineResult() },
    })

    const persisted = readPersisted()
    expect(persisted.pipelineRunId).toBe('run-1')
    expect(persisted.pipelineResult).toBeNull()
    expect(loadSavedRunState().sourceStep).toBe('pipeline_running')
  })

  it('drops the stale entry when nothing fits, instead of throwing', () => {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify({ sourceStep: 'edit' }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })

    expect(() => saveRunState(completedRun())).not.toThrow()
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBeNull()
  })

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'SecurityError')
    })

    expect(() => saveRunState(completedRun())).not.toThrow()
    expect(() => clearRunState()).not.toThrow()
  })
})

describe('loadSavedRunState across pipeline versions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adopts an untagged entry written before v3 existed as a v2 run', () => {
    // A completed run sitting in a tab across the upgrade must still open.
    localStorage.setItem(
      RUN_STORAGE_KEY,
      JSON.stringify({
        sourceStep: 'pipeline_complete',
        pipelineRunId: 'run-1',
        pipelineResult: buildPipelineResult(),
      }),
    )

    const loaded = loadSavedRunState()

    expect(loaded.sourceStep).toBe('pipeline_complete')
    expect(loaded.pipelineResult?.version).toBe('v2')
    expect(loaded.pipelineResult?.payload.final_markdown).toBe('# Title')
  })

  it('round-trips a v3 run without its debug payload', () => {
    saveRunState({
      sourceStep: 'pipeline_complete',
      pipelineRunId: 'run-3',
      pipelineResult: { version: 'v3', payload: buildV3PipelineResult() },
    })

    expect(localStorage.getItem(RUN_STORAGE_KEY)).not.toContain('pipeline_trace')

    const loaded = loadSavedRunState()
    expect(loaded.pipelineResult?.version).toBe('v3')
    expect(loaded.pipelineResult?.payload.final_markdown).toBe('# Lima')
  })

  it('discards a result that carries no quality review either way', () => {
    localStorage.setItem(
      RUN_STORAGE_KEY,
      JSON.stringify({
        sourceStep: 'pipeline_complete',
        pipelineRunId: 'run-1',
        pipelineResult: { version: 'v3', payload: { run_id: 'run-1' } },
      }),
    )

    expect(loadSavedRunState()).toEqual({
      sourceStep: 'edit',
      pipelineRunId: null,
      pipelineResult: null,
    })
  })
})
