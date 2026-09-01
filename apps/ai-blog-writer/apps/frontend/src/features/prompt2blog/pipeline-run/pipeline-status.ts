import {
  PROMPT2BLOG_PIPELINE_STAGES,
  PROMPT2BLOG_V3_PIPELINE_STAGES,
  type KnownPrompt2BlogPipelineStage,
  type Prompt2BlogPipelineStage,
  type Prompt2BlogStatusResponse,
} from '../types/pipeline.types'
import { getStepStatus } from '../../pipelineRuns'
import type { PipelineStepStatus } from './pipeline-run.types'

export const PIPELINE_STAGE_LABELS: Record<Prompt2BlogPipelineStage, string> = {
  queued: 'Queued',
  stage_input_validate: 'Validate inputs',
  stage_input_cleanup: 'Clean source material',
  stage_synthesize_sources: 'Synthesize source material',
  stage_guideline_fetch: 'Fetch article guidelines',
  stage_coverage_check: 'Check coverage against brief + guideline',
  stage_supplement: 'Generate supplemental sections (if needed)',
  stage_outline: 'Plan article sections',
  stage_compose: 'Compose full draft',
  stage_groundedness: 'Check claims against sources',
  stage_quality_audit: 'Audit draft quality and constraints',
  stage_repair: 'Repair pass (if needed)',
  stage_quality_settle: 'Settle on the best-scoring draft',
  stage_editorial_augmentation: 'Apply editorial blocks (if helpful)',
  stage_final_verify: 'Re-check the article being shipped',
  stage_title: 'Generate final title',
  stage_finalize: 'Finalize markdown output',
  stage_v3_outline: 'Plan sections against the commission',
  stage_v3_compose: 'Compose the draft from the evidence',
  stage_v3_groundedness: 'Check every claim against the evidence',
  stage_v3_quality_audit: 'Audit commission fidelity and constraints',
  stage_v3_repair: 'Repair pass (if needed)',
  stage_v3_quality_settle: 'Settle on the best-scoring draft',
  stage_v3_finalize: 'Finalize markdown output',
  // Retired (ADR 0034). Kept so a run stored before the title stage was
  // deleted still names what it was doing rather than reading as unknown.
  stage_v3_title: 'Generate the headline',
  complete: 'Complete',
  unknown: 'Unknown pipeline stage',
}

/**
 * Progress is read against one version's stage order. Passing the v2 order a
 * v3 stage name (or the reverse) would place every step at index -1 and stall
 * the whole progress list, so callers pass the order the run is actually using.
 */
export function getPipelineStepStatus(
  step: KnownPrompt2BlogPipelineStage,
  status: Prompt2BlogStatusResponse | null,
  stageOrder: readonly string[] = PROMPT2BLOG_PIPELINE_STAGES,
  hasStartedRun = true,
): PipelineStepStatus {
  // Before a run exists there is no progress to report. Showing `queued` as
  // running on an untouched page tells a first-time operator that something is
  // already happening, and the only honest answer is that nothing is.
  if (!hasStartedRun) return 'pending'
  if (!status) return step === 'queued' ? 'running' : 'pending'
  return getStepStatus({
    step,
    status,
    stageOrder,
  })
}

export const PROMPT2BLOG_STAGE_ORDERS = {
  v2: PROMPT2BLOG_PIPELINE_STAGES,
  v3: PROMPT2BLOG_V3_PIPELINE_STAGES,
} as const satisfies Record<'v2' | 'v3', readonly KnownPrompt2BlogPipelineStage[]>

/**
 * The sentence an operator reads when a run stops.
 *
 * Built from `failure_kind` rather than from the backend's `error` string, so
 * it says what happened in the same words every time and never has to be
 * matched out of prose. The raw `error` still goes to the run log for
 * debugging -- this replaces what is shown, not what is recorded.
 */
export function describePipelineFailure(
  status: Pick<Prompt2BlogStatusResponse, 'stage' | 'error' | 'failure_kind'>,
): string {
  const stageLabel =
    PIPELINE_STAGE_LABELS[status.stage] || status.stage || 'an early stage'

  switch (status.failure_kind) {
    case 'quota_exhausted':
      return (
        `Claude's account hit its usage or spending limit during "${stageLabel}". ` +
        'The run stopped there and made no further calls. Try again once the ' +
        'limit resets, or switch the run to a different model stack.'
      )
    case 'not_connected':
      return (
        'Claude is not connected on this machine, so nothing was sent. ' +
        'Reconnect the Claude account and start the run again.'
      )
    case 'provider_unavailable':
      return (
        `Claude had a temporary problem during "${stageLabel}". ` +
        'Nothing is wrong with the article inputs -- the run can be retried as is.'
      )
    case 'invalid_response':
      return (
        `Claude answered during "${stageLabel}" with something the pipeline ` +
        'could not use. Retrying usually clears it.'
      )
    default:
      return status.error || 'Pipeline failed.'
  }
}
