/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRunState,
  loadSavedRunState,
  RUN_STORAGE_KEY,
  saveRunState,
} from './pipeline-run.storage'
import type { PersistedRunState } from './pipeline-run.types'
import type { Prompt2BlogPipelinePayload } from '../api'

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

function completedRun(): PersistedRunState {
  return {
    sourceStep: 'pipeline_complete',
    pipelineRunId: 'run-1',
    pipelineResult: buildPipelineResult(),
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
    expect(pipelineResult).not.toHaveProperty('debug')
    expect(pipelineResult.final_markdown).toBe('# Title')
    expect(localStorage.getItem(RUN_STORAGE_KEY)).not.toContain('pipeline_trace')
  })

  it('restores a completed run persisted without its debug trace', () => {
    saveRunState(completedRun())

    const loaded = loadSavedRunState()
    expect(loaded.sourceStep).toBe('pipeline_complete')
    expect(loaded.pipelineRunId).toBe('run-1')
    expect(loaded.pipelineResult?.final_markdown).toBe('# Title')
  })

  it('leaves a running pipeline resumable when the result exceeds the quota', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setItem.mockImplementationOnce(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })

    saveRunState({
      sourceStep: 'pipeline_running',
      pipelineRunId: 'run-1',
      pipelineResult: buildPipelineResult(),
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
