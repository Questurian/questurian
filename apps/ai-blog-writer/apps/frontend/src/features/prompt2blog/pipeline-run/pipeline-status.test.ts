import { describe, expect, it } from 'vitest'
import type { Prompt2BlogPipelineStage, Prompt2BlogStatusResponse } from '../api'
import {
  PROMPT2BLOG_KNOWN_PIPELINE_STAGES,
  PROMPT2BLOG_RETIRED_PIPELINE_STAGES,
  PROMPT2BLOG_V3_PIPELINE_STAGES,
} from '../types/pipeline.types'
import {
  describePipelineFailure,
  getPipelineStepStatus,
  PIPELINE_STAGE_LABELS,
  PROMPT2BLOG_STAGE_ORDERS,
} from './pipeline-status'

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
  it('marks queued as running once a run has started but has no status yet', () => {
    expect(getPipelineStepStatus('queued', null)).toBe('running')
    expect(getPipelineStepStatus('stage_input_validate', null)).toBe('pending')
  })

  it('reports nothing at all before a run exists', () => {
    // An untouched page that shows `queued` as running tells a first-time
    // operator something is already happening. Nothing is.
    expect(
      getPipelineStepStatus('queued', null, PROMPT2BLOG_STAGE_ORDERS.v3, false)
    ).toBe('pending')
    expect(
      getPipelineStepStatus('stage_v3_compose', null, PROMPT2BLOG_STAGE_ORDERS.v3, false)
    ).toBe('pending')
  })

  it('still reports a real run when one has started', () => {
    const status = createStatus({ state: 'running', stage: 'stage_compose' })

    expect(
      getPipelineStepStatus('stage_compose', status, PROMPT2BLOG_STAGE_ORDERS.v2, true)
    ).toBe('running')
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
    expect(getPipelineStepStatus('stage_v3_finalize', status, v3)).toBe('pending')
  })

  it('does not render a retired stage as a step of a new run', () => {
    // `PipelinePanel` draws one row per entry in this order, so a stage the
    // graph no longer runs would sit pending for the whole run and the list
    // would never complete. ADR 0034 deleted the title stage.
    expect(PROMPT2BLOG_V3_PIPELINE_STAGES).not.toContain('stage_v3_title')
    expect(PROMPT2BLOG_STAGE_ORDERS.v3).not.toContain('stage_v3_title')
  })

  it('still reads a retired stage a stored run reports', () => {
    // The other half: dropping the name entirely would make a run recorded
    // before the deletion render as an unknown stage.
    expect(PROMPT2BLOG_RETIRED_PIPELINE_STAGES).toContain('stage_v3_title')
    expect(PROMPT2BLOG_KNOWN_PIPELINE_STAGES).toContain('stage_v3_title')
    expect(PIPELINE_STAGE_LABELS.stage_v3_title).toBeTruthy()
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

describe('describePipelineFailure', () => {
  it('says the account ran out, and that nothing else was tried', () => {
    // The bug this replaces: the banner read "Grounding check did not run",
    // which describes a checker problem, for a run that stopped because the
    // account was exhausted.
    const message = describePipelineFailure(
      createStatus({
        state: 'failed',
        stage: 'stage_v3_groundedness',
        error: "Claude's account has hit its usage or spending limit.",
        failure_kind: 'quota_exhausted',
      }),
    )

    expect(message).toContain('limit')
    expect(message).toContain('made no further calls')
    expect(message).toContain(PIPELINE_STAGE_LABELS.stage_v3_groundedness)
  })

  it('separates a temporary problem from an exhausted account', () => {
    const message = describePipelineFailure(
      createStatus({
        state: 'failed',
        stage: 'stage_v3_compose',
        error: 'Claude did not answer within 600s.',
        failure_kind: 'provider_unavailable',
      }),
    )

    expect(message).toContain('temporary')
    expect(message).not.toContain('limit')
  })

  it('tells an operator to reconnect when Claude was never reachable', () => {
    const message = describePipelineFailure(
      createStatus({ state: 'failed', error: 'nope', failure_kind: 'not_connected' }),
    )

    expect(message).toContain('not connected')
  })

  it('falls back to the raw error when no kind was recorded', () => {
    // Ordinary failures -- a bug, a parse error -- carry no kind, and the
    // backend sentence is still the most useful thing to show.
    const message = describePipelineFailure(
      createStatus({ state: 'failed', error: 'Failed to parse JSON LLM response' }),
    )

    expect(message).toBe('Failed to parse JSON LLM response')
  })

  it('never shows an empty banner', () => {
    expect(describePipelineFailure(createStatus({ state: 'failed', error: null }))).toBe(
      'Pipeline failed.',
    )
  })
})
