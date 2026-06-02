import { describe, expect, it } from 'vitest'
import { normalizePrompt2BlogStatusResponse } from './pipeline.api'

describe('normalizePrompt2BlogStatusResponse', () => {
  it('keeps a valid status response unchanged', () => {
    expect(
      normalizePrompt2BlogStatusResponse(
        {
          run_id: 'run-123',
          feature: 'prompt2blog',
          state: 'running',
          stage: 'stage_compose',
          error: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
        'fallback-run',
      ),
    ).toEqual({
      run_id: 'run-123',
      feature: 'prompt2blog',
      state: 'running',
      stage: 'stage_compose',
      error: null,
      updated_at: '2026-01-01T00:00:00Z',
    })
  })

  it('defaults missing or unknown stage to queued', () => {
    expect(
      normalizePrompt2BlogStatusResponse(
        {
          run_id: 'run-123',
          feature: 'prompt2blog',
          state: 'running',
          error: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
        'fallback-run',
      ).stage,
    ).toBe('queued')

    expect(
      normalizePrompt2BlogStatusResponse(
        {
          run_id: 'run-123',
          feature: 'prompt2blog',
          state: 'running',
          stage: 'stage_unknown',
          error: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
        'fallback-run',
      ).stage,
    ).toBe('queued')
  })

  it('defaults missing or unknown state to pending', () => {
    expect(normalizePrompt2BlogStatusResponse({ stage: 'stage_compose' }, 'run-123').state).toBe('pending')
    expect(
      normalizePrompt2BlogStatusResponse({ state: 'paused', stage: 'stage_compose' }, 'run-123').state,
    ).toBe('pending')
  })
})
