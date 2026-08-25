/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import limaFixture from '../../../../../../../data/fixtures/prompt2blog/lima-scope-drift-v3.json'
import * as prompt2blogApi from '../../api'
import type { Prompt2BlogRunRequest, Prompt2BlogV3Request } from '../../api'
import { usePrompt2BlogPipelineRun } from './usePrompt2BlogPipelineRun'

vi.mock('../../api', () => ({
  PROMPT2BLOG_PIPELINE_STAGES: [],
  getPrompt2BlogDebug: vi.fn(),
  getPrompt2BlogResult: vi.fn(),
  getPrompt2BlogStatus: vi.fn(),
  startPrompt2BlogRun: vi.fn(),
  startPrompt2BlogV3Run: vi.fn(),
}))

const startPrompt2BlogRunMock = vi.mocked(prompt2blogApi.startPrompt2BlogRun)
const startPrompt2BlogV3RunMock = vi.mocked(prompt2blogApi.startPrompt2BlogV3Run)

const v3Payload = {
  schema_version: 3,
  commission: limaFixture.commission,
  evidence_package: limaFixture.evidence_package,
  profiles: { tone_id: 'balanced', length_id: 'standard' },
} as unknown as Prompt2BlogV3Request

const v2Payload = {
  article_type_id: 7,
  source_material: ['Something to write from.'],
  article_goal: 'Goal',
  target_reader: 'Reader',
  destination_context: 'Lima, Peru',
  tone_id: 'balanced',
  length_id: 'standard',
} as Prompt2BlogRunRequest

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderRun(options: Parameters<typeof usePrompt2BlogPipelineRun>[0]) {
  return renderHook(() => usePrompt2BlogPipelineRun(options), { wrapper })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // The lifecycle polls status as soon as a run is queued; a resolved pending
  // status keeps the poll quiet without exercising terminal handling here.
  vi.mocked(prompt2blogApi.getPrompt2BlogStatus).mockResolvedValue({
    run_id: 'run',
    feature: 'prompt2blog',
    state: 'running',
    stage: 'queued',
    error: null,
    updated_at: '2026-08-25T00:00:00Z',
  })
})

describe('usePrompt2BlogPipelineRun submission routing', () => {
  it('sends an approved commission to the v3 route and never to v2', async () => {
    startPrompt2BlogV3RunMock.mockResolvedValue({ status: 'queued', run_id: 'v3-run' })
    const { result } = renderRun({ v2Payload: null, v3Payload })

    expect(result.current.pipelineVersion).toBe('v3')
    act(() => result.current.run())

    await waitFor(() => expect(result.current.pipelineRunId).toBe('v3-run'))
    expect(startPrompt2BlogV3RunMock).toHaveBeenCalledWith(v3Payload)
    expect(startPrompt2BlogRunMock).not.toHaveBeenCalled()
    expect(result.current.sourceStep).toBe('pipeline_running')
  })

  it('keeps a legacy draft on the v2 route', async () => {
    startPrompt2BlogRunMock.mockResolvedValue({ message: 'queued', run_id: 'v2-run' })
    const { result } = renderRun({ v2Payload, v3Payload: null })

    expect(result.current.pipelineVersion).toBe('v2')
    act(() => result.current.run())

    await waitFor(() => expect(result.current.pipelineRunId).toBe('v2-run'))
    expect(startPrompt2BlogRunMock).toHaveBeenCalledWith(v2Payload)
    expect(startPrompt2BlogV3RunMock).not.toHaveBeenCalled()
  })

  it('does not fall back to v2 when v3 work is incomplete', async () => {
    const { result } = renderRun({
      v2Payload,
      v3Payload: null,
      v3BlockedReason: 'Approve the commission before running.',
    })

    act(() => result.current.run())

    await waitFor(() =>
      expect(result.current.error).toBe('Approve the commission before running.'),
    )
    expect(startPrompt2BlogRunMock).not.toHaveBeenCalled()
    expect(startPrompt2BlogV3RunMock).not.toHaveBeenCalled()
  })
})

describe('needs_research', () => {
  const needsResearch = {
    status: 'needs_research' as const,
    commission_fingerprint: limaFixture.commission.commission_fingerprint,
    findings: [
      {
        code: 'requirement_gap' as const,
        requirement_ids: ['r2'],
        message: 'No evidence covers the tradeoffs.',
      },
    ],
    unresolved_requirements: [
      { requirement_id: 'r2', question: 'Which tradeoffs?', gap: 'Nothing found.' },
    ],
    unresolved_conflict_ids: [],
    missing_source_requirements: [],
    follow_up_research_prompt: 'Close r2.',
  }

  it('is a result, not a failure: nothing is queued and no run starts', async () => {
    startPrompt2BlogV3RunMock.mockResolvedValue(needsResearch)
    const { result } = renderRun({ v2Payload: null, v3Payload })

    act(() => result.current.run())

    await waitFor(() => expect(result.current.needsResearch).toEqual(needsResearch))
    expect(result.current.pipelineRunId).toBeNull()
    expect(result.current.sourceStep).toBe('edit')
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('clears on dismiss and on a fresh run', async () => {
    startPrompt2BlogV3RunMock.mockResolvedValue(needsResearch)
    const { result } = renderRun({ v2Payload: null, v3Payload })

    act(() => result.current.run())
    await waitFor(() => expect(result.current.needsResearch).not.toBeNull())

    act(() => result.current.dismissNeedsResearch())
    expect(result.current.needsResearch).toBeNull()
  })
})
