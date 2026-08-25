import { beforeEach, describe, expect, it, vi } from 'vitest'
import legacyRequestFixture from '../../../../../../data/fixtures/prompt2blog/legacy-v2-request.json'
import legacyResultFixture from '../../../../../../data/fixtures/prompt2blog/legacy-v2-result.json'
import type { Prompt2BlogRunRequest } from '../types/pipeline.types'
import {
  getPrompt2BlogResult,
  normalizePrompt2BlogStatusResponse,
  startPrompt2BlogRun,
} from './pipeline.api'

const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

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

  it('defaults missing stage to queued', () => {
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
  })

  it('normalizes unknown stage to a visible unknown state', () => {
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
      ),
    ).toEqual({
      run_id: 'run-123',
      feature: 'prompt2blog',
      state: 'running',
      stage: 'unknown',
      raw_stage: 'stage_unknown',
      error: null,
      updated_at: '2026-01-01T00:00:00Z',
    })
  })

  it('defaults missing or unknown state to pending', () => {
    expect(normalizePrompt2BlogStatusResponse({ stage: 'stage_compose' }, 'run-123').state).toBe('pending')
    expect(
      normalizePrompt2BlogStatusResponse({ state: 'paused', stage: 'stage_compose' }, 'run-123').state,
    ).toBe('pending')
  })
})

describe('legacy v2 API contracts', () => {
  it('posts the existing request body to the existing run route unchanged', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'queued', run_id: 'legacy-v2-run' }),
    })

    await startPrompt2BlogRun(
      legacyRequestFixture as unknown as Prompt2BlogRunRequest,
    )

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:4003/prompt2blog/run')
    expect(JSON.parse(init.body as string)).toEqual(legacyRequestFixture)
  })

  it('passes an existing v2 result artifact through unchanged', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => legacyResultFixture,
    })

    await expect(getPrompt2BlogResult('legacy-v2-run')).resolves.toEqual(
      legacyResultFixture,
    )
  })
})
