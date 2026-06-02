import { describe, expect, it } from 'vitest'
import { getPipelineProgressState } from './pipelineProgress'

const stageOrder = ['queued', 'draft', 'review', 'publish'] as const

function getState(status: { state?: string | null; stage?: string | null } | null, step = 'review') {
  return getPipelineProgressState({
    step,
    status,
    stageOrder,
    doneState: 'done',
    runningState: 'running',
    pendingState: 'pending',
    failedState: 'failed',
  })
}

describe('getPipelineProgressState', () => {
  it('marks every step done when run completed', () => {
    const staleStatus = { state: 'completed', stage: 'draft' }

    expect(getState(staleStatus, 'queued')).toBe('done')
    expect(getState(staleStatus, 'draft')).toBe('done')
    expect(getState(staleStatus, 'review')).toBe('done')
    expect(getState(staleStatus, 'publish')).toBe('done')
  })

  it('marks previous, current, and future steps during a run', () => {
    const status = { state: 'running', stage: 'review' }

    expect(getState(status, 'draft')).toBe('done')
    expect(getState(status, 'review')).toBe('running')
    expect(getState(status, 'publish')).toBe('pending')
  })

  it('marks only the active failed stage as failed', () => {
    const status = { state: 'failed', stage: 'review' }

    expect(getState(status, 'draft')).toBe('done')
    expect(getState(status, 'review')).toBe('failed')
    expect(getState(status, 'publish')).toBe('pending')
  })

  it('marks unknown or missing stages pending', () => {
    expect(getState(null, 'queued')).toBe('pending')
    expect(getState({ state: 'running', stage: null }, 'queued')).toBe('pending')
    expect(getState({ state: 'running', stage: 'missing' }, 'queued')).toBe('pending')
  })
})
