import { describe, expect, it } from 'vitest'
import { getStepStatus, normalizePipelineStatus } from './progress'

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
})
