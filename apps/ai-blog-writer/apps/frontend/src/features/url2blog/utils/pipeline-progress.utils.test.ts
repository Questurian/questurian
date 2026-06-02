import { describe, expect, it } from 'vitest'
import type { Url2BlogStatusResponse } from '../types/pipeline.types'
import { URL2BLOG_PROGRESS_STEPS } from '../constants/pipeline-ui.constants'
import { getProgressItemState, getStageLabel } from './pipeline-progress.utils'

const rewriteStep = URL2BLOG_PROGRESS_STEPS.find((step) => step.stage === 'rewrite_quality')!

function status(overrides: Partial<Url2BlogStatusResponse>): Url2BlogStatusResponse {
  return { run_id: 'run-1', state: 'running', stage: 'rewrite_quality', updated_at: '', ...overrides }
}

describe('pipeline progress utils', () => {
  it('labels the active stage and marks it running', () => {
    expect(getStageLabel('rewrite_quality')).toBe('Rewrite + quality checks')
    expect(getProgressItemState(rewriteStep, status({}))).toBe('running')
  })

  it('marks a failed active stage', () => {
    expect(getProgressItemState(rewriteStep, status({ state: 'failed' }))).toBe('failed')
  })

  it('marks every stage done after completion', () => {
    expect(getProgressItemState(rewriteStep, status({ state: 'completed' }))).toBe('done')
  })
})
