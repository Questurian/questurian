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
  stage_v3_title: 'Generate the headline',
  stage_v3_finalize: 'Finalize markdown output',
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
): PipelineStepStatus {
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
