import { describe, expect, it } from 'vitest'
import type { Prompt2BlogPipelineStage, Prompt2BlogStatusResponse } from '../api'
import { getPipelineStepStatus } from './pipeline-status'

function createStatus(overrides: Partial<Prompt2BlogStatusResponse> = {}): Prompt2BlogStatusResponse {
  return {
    run_id: 'run-123',
    feature: 'prompt2blog',
    state: 'running',
    stage: 'stage_compose',
    error: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('getPipelineStepStatus', () => {
  it('marks queued as running before status exists', () => {
    expect(getPipelineStepStatus('queued', null)).toBe('running')
    expect(getPipelineStepStatus('stage_input_validate', null)).toBe('pending')
  })

  it('marks previous, current, and future steps during an in-progress run', () => {
    const status = createStatus({ state: 'running', stage: 'stage_compose' })

    expect(getPipelineStepStatus('stage_coverage_check', status)).toBe('done')
    expect(getPipelineStepStatus('stage_compose', status)).toBe('running')
    expect(getPipelineStepStatus('stage_quality_audit', status)).toBe('pending')
  })

  it('marks failed stage as error and previous stages as done', () => {
    const status = createStatus({ state: 'failed', stage: 'stage_compose', error: 'bad draft' })

    expect(getPipelineStepStatus('stage_coverage_check', status)).toBe('done')
    expect(getPipelineStepStatus('stage_compose', status)).toBe('error')
    expect(getPipelineStepStatus('stage_quality_audit', status)).toBe('pending')
  })

  it('marks all stages done when run completed', () => {
    const status = createStatus({ state: 'completed', stage: 'stage_compose' })

    expect(getPipelineStepStatus('stage_compose', status)).toBe('done')
    expect(getPipelineStepStatus('stage_finalize', status)).toBe('done')
    expect(getPipelineStepStatus('complete', status)).toBe('done')
  })

  it('treats normalized missing stage as queued', () => {
    const status = createStatus({ stage: 'queued' as Prompt2BlogPipelineStage })

    expect(getPipelineStepStatus('queued', status)).toBe('running')
    expect(getPipelineStepStatus('stage_input_validate', status)).toBe('pending')
  })

  it('does not make an unknown stage look like a restart', () => {
    const status = createStatus({ stage: 'unknown', raw_stage: 'stage_unknown' })

    expect(getPipelineStepStatus('queued', status)).toBe('pending')
    expect(getPipelineStepStatus('stage_input_validate', status)).toBe('pending')
  })
})
