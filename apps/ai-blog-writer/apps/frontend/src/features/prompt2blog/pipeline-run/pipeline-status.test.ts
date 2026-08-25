import { describe, expect, it } from 'vitest'
import type { Prompt2BlogPipelineStage, Prompt2BlogStatusResponse } from '../api'
import { PROMPT2BLOG_V3_PIPELINE_STAGES } from '../types/pipeline.types'
import { getPipelineStepStatus, PIPELINE_STAGE_LABELS, PROMPT2BLOG_STAGE_ORDERS } from './pipeline-status'

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

  it('marks failed stage as failed and previous stages as done', () => {
    const status = createStatus({ state: 'failed', stage: 'stage_compose', error: 'bad draft' })

    expect(getPipelineStepStatus('stage_coverage_check', status)).toBe('done')
    expect(getPipelineStepStatus('stage_compose', status)).toBe('failed')
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

describe('v3 stage progress', () => {
  it('reads v3 progress against the v3 order', () => {
    const status = createStatus({ state: 'running', stage: 'stage_v3_groundedness' })
    const v3 = PROMPT2BLOG_STAGE_ORDERS.v3

    expect(getPipelineStepStatus('stage_v3_compose', status, v3)).toBe('done')
    expect(getPipelineStepStatus('stage_v3_groundedness', status, v3)).toBe('running')
    expect(getPipelineStepStatus('stage_v3_title', status, v3)).toBe('pending')
  })

  it('stalls a v3 stage read against the v2 order, which is why the order is passed', () => {
    const status = createStatus({ state: 'running', stage: 'stage_v3_groundedness' })

    expect(getPipelineStepStatus('stage_v3_groundedness', status)).toBe('pending')
  })

  it('labels every v3 stage', () => {
    for (const stage of PROMPT2BLOG_V3_PIPELINE_STAGES) {
      expect(PIPELINE_STAGE_LABELS[stage]).toBeTruthy()
    }
  })
})
