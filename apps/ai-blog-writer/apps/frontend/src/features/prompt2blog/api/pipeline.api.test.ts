import { beforeEach, describe, expect, it, vi } from 'vitest'
import legacyResultFixture from '../../../../../../data/fixtures/prompt2blog/legacy-v2-result.json'
import limaFixture from '../../../../../../data/fixtures/prompt2blog/lima-scope-drift-v3.json'
import type { Prompt2BlogV3Request } from '../types/editorial.types'
import {
  getPrompt2BlogResult,
  normalizePrompt2BlogStatusResponse,
  startPrompt2BlogV3Run,
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

  it('keeps a v3 stage name recognized rather than unknown', () => {
    expect(
      normalizePrompt2BlogStatusResponse(
        {
          run_id: 'run-123',
          feature: 'prompt2blog',
          state: 'running',
          stage: 'stage_v3_compose',
          error: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
        'fallback-run',
      ),
    ).toEqual({
      run_id: 'run-123',
      feature: 'prompt2blog',
      state: 'running',
      stage: 'stage_v3_compose',
      error: null,
      updated_at: '2026-01-01T00:00:00Z',
    })
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

describe('startPrompt2BlogV3Run', () => {
  const v3Request = {
    schema_version: 3,
    commission: limaFixture.commission,
    evidence_package: limaFixture.evidence_package,
    profiles: { tone_id: 'editorial-analysis', length_id: 'long' },
  } as unknown as Prompt2BlogV3Request

  it('posts the v3 request to the v3 route', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'queued', status: 'queued', run_id: 'v3-run' }),
    })

    await expect(startPrompt2BlogV3Run(v3Request)).resolves.toEqual({
      message: 'queued',
      status: 'queued',
      run_id: 'v3-run',
    })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:4003/prompt2blog/pipeline-v3')
    expect(JSON.parse(init.body as string)).toEqual(v3Request)
  })

  it('returns needs_research as a result rather than throwing', async () => {
    const needsResearch = {
      message: 'Prompt2Blog v3 commission needs more research',
      status: 'needs_research',
      commission_fingerprint: limaFixture.commission.commission_fingerprint,
      findings: [{ code: 'requirement_gap', requirement_ids: ['r2'], message: 'No evidence.' }],
      unresolved_requirements: [{ requirement_id: 'r2', question: 'Which tradeoffs?', gap: 'None.' }],
      unresolved_conflict_ids: [],
      missing_source_requirements: [],
      follow_up_research_prompt: 'Close r2.',
    }
    mockFetch.mockResolvedValue({ ok: true, json: async () => needsResearch })

    await expect(startPrompt2BlogV3Run(v3Request)).resolves.toEqual(needsResearch)
  })

  it('rejects a start response that names neither outcome', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ run_id: 'v3-run' }) })

    await expect(startPrompt2BlogV3Run(v3Request)).rejects.toThrow(
      'unrecognized start response',
    )
  })

  it('rejects a queued response with no run id to poll', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'queued' }) })

    await expect(startPrompt2BlogV3Run(v3Request)).rejects.toThrow(
      'unrecognized start response',
    )
  })
})

describe('v3 result artifacts', () => {
  it('reads a v3 artifact without disturbing the legacy key', async () => {
    const v3Result = {
      run_id: 'v3-run',
      markdown: '# Lima',
      artifact: { pipeline_v3: { run_id: 'v3-run', status: 'completed' } },
    }
    mockFetch.mockResolvedValue({ ok: true, json: async () => v3Result })

    const result = await getPrompt2BlogResult('v3-run')

    expect(result.artifact.pipeline_v3).toBeDefined()
    expect(result.artifact.pipeline_v2).toBeUndefined()
  })
})
