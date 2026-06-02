import { describe, expect, it } from 'vitest'
import { finalizeStatusResponse, getStepStatus, normalizePipelineStatus } from './progress'

const stageOrder = ['queued', 'draft', 'review', 'publish'] as const

function getStatus(status: { state?: string | null; stage?: string | null } | null, step = 'review') {
  return getStepStatus({
    step,
    status,
    stageOrder,
  })
}

describe('pipeline run progress', () => {
  it('marks every step done when run completed', () => {
    const staleStatus = { state: 'completed', stage: 'draft' }

    expect(getStatus(staleStatus, 'queued')).toBe('done')
    expect(getStatus(staleStatus, 'draft')).toBe('done')
    expect(getStatus(staleStatus, 'review')).toBe('done')
    expect(getStatus(staleStatus, 'publish')).toBe('done')
  })

  it('marks previous, current, and future steps during a run', () => {
    const status = { state: 'running', stage: 'review' }

    expect(getStatus(status, 'draft')).toBe('done')
    expect(getStatus(status, 'review')).toBe('running')
    expect(getStatus(status, 'publish')).toBe('pending')
  })

  it('marks only the active failed stage as failed', () => {
    const status = { state: 'failed', stage: 'review' }

    expect(getStatus(status, 'draft')).toBe('done')
    expect(getStatus(status, 'review')).toBe('failed')
    expect(getStatus(status, 'publish')).toBe('pending')
  })

  it('marks unknown or missing stages pending', () => {
    expect(getStatus(null, 'queued')).toBe('pending')
    expect(getStatus({ state: 'running', stage: null }, 'queued')).toBe('pending')
    expect(getStatus({ state: 'running', stage: 'missing' }, 'queued')).toBe('pending')
  })

  it('keeps optional steps pending except while active', () => {
    expect(
      getStepStatus({
        step: 'review_repair',
        status: { state: 'running', stage: 'review' },
        stageOrder: ['review', 'review_repair', 'publish'],
        optional: true,
      }),
    ).toBe('pending')
    expect(
      getStepStatus({
        step: 'review_repair',
        status: { state: 'running', stage: 'review_repair' },
        stageOrder: ['review', 'review_repair', 'publish'],
        optional: true,
      }),
    ).toBe('running')
    expect(
      getStepStatus({
        step: 'review_repair',
        status: { state: 'failed', stage: 'review_repair' },
        stageOrder: ['review', 'review_repair', 'publish'],
        optional: true,
      }),
    ).toBe('failed')
  })

  it('normalizes unknown stage and state to defaults', () => {
    expect(
      normalizePipelineStatus({
        value: { run_id: 123, state: 'paused', stage: 'missing' },
        stages: stageOrder,
        defaults: {
          run_id: 'run-1',
          state: 'pending',
          stage: 'queued',
        },
      }),
    ).toEqual({
      run_id: 123,
      state: 'pending',
      stage: 'queued',
    })
  })

  it('can preserve raw unknown stage as explicit unknown', () => {
    expect(
      normalizePipelineStatus({
        value: { run_id: 'run-1', state: 'running', stage: 'stage_added_later' },
        stages: stageOrder,
        unknownStage: 'unknown',
        rawStageField: 'raw_stage',
        defaults: {
          run_id: 'run-1',
          state: 'pending',
          stage: 'queued' as 'queued' | 'draft' | 'review' | 'publish' | 'unknown',
          raw_stage: null as string | null,
        },
      }),
    ).toEqual({
      run_id: 'run-1',
      state: 'running',
      stage: 'unknown',
      raw_stage: 'stage_added_later',
    })
  })

  it('finalizes common status fields', () => {
    expect(
      finalizeStatusResponse(
        {
          run_id: 123 as unknown as string,
          state: 'running',
          stage: 'draft',
          updated_at: null as unknown as string,
          error: 404 as unknown as string,
        },
        { fallbackRunId: 'run-1' },
      ),
    ).toEqual({
      run_id: 'run-1',
      state: 'running',
      stage: 'draft',
      updated_at: '',
      error: null,
    })
  })
})
