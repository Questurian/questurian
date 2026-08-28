/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Prompt2BlogResumePlan } from '../../types/pipeline.types'
import { PipelinePanel } from './PipelinePanel'

type PanelRun = Parameters<typeof PipelinePanel>[0]['run']

const RESUMABLE: Prompt2BlogResumePlan = {
  run_id: 'lima-run',
  resumable: true,
  reason: 'resumable',
  resume_from_stage: 'stage_v3_quality_audit',
  failed_stage: 'stage_v3_quality_audit',
  failure_kind: 'quota_exhausted',
  completed_stages: ['stage_v3_outline', 'stage_v3_compose', 'stage_v3_groundedness'],
  tokens_already_spent: 239_610,
  resume_count: 0,
  resume_attempts_allowed: 3,
}

function panelRun(overrides: Partial<PanelRun> = {}): PanelRun {
  return {
    canOpenCleanupModal: false,
    dismissNeedsResearch: () => {},
    error: null,
    hasStartedRun: true,
    isLoading: false,
    loadingLabel: '',
    needsResearch: null,
    pipelineDebugData: null,
    pipelineLogs: [],
    pipelineResult: null,
    pipelineRunId: 'lima-run',
    pipelineStatus: null,
    pipelineVersion: 'v3',
    resume: () => {},
    resumePlan: null,
    run: () => {},
    reset: () => {},
    setError: () => {},
    setPipelineDebugData: () => {},
    showPipelineDebug: false,
    sourceStep: 'edit',
    stageArticleUrl: null,
    togglePipelineDebug: () => {},
    ...overrides,
  } as unknown as PanelRun
}

function renderPanel(run: PanelRun) {
  return render(
    <PipelinePanel
      run={run}
      onBackToResearch={() => {}}
      onOpenCleanupModal={() => {}}
      onReset={() => {}}
    />,
  )
}

describe('resuming a failed run from the pipeline panel', () => {
  it('offers to continue from the stage that failed, and says what is already saved', async () => {
    const resume = vi.fn()
    renderPanel(panelRun({ resumePlan: RESUMABLE, resume }))

    const button = screen.getByRole('button', { name: 'Resume Run' })
    // The numbers that make the decision, in front of the operator.
    const notice = screen.getByRole('status').textContent || ''
    expect(notice).toContain('3 stages are already written and saved')
    expect(notice).toContain('239,610 tokens spent so far')
    expect(notice).toContain('Audit commission fidelity and constraints')

    await userEvent.click(button)
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('says why rather than hiding the button when the run cannot be continued', () => {
    renderPanel(
      panelRun({
        resumePlan: {
          ...RESUMABLE,
          resumable: false,
          reason: 'resume_limit_reached',
          resume_from_stage: null,
          resume_count: 3,
        },
      }),
    )

    expect(screen.queryByRole('button', { name: 'Resume Run' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(
      'resumed as many times as it is allowed',
    )
  })

  it('shows nothing about resuming while no run has failed', () => {
    renderPanel(panelRun())

    expect(screen.queryByRole('button', { name: 'Resume Run' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
