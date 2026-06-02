import {
  PROMPT2BLOG_PIPELINE_STAGES,
  type Prompt2BlogPipelineStage,
  type Prompt2BlogStatusResponse,
} from '../types/pipeline.types'
import { getPipelineProgressState } from '../../../shared/pipelineProgress'
import type { PipelineStepStatus } from './pipeline-run.types'

export const PIPELINE_STAGE_ORDER = PROMPT2BLOG_PIPELINE_STAGES satisfies readonly Prompt2BlogPipelineStage[]

export const PIPELINE_STAGE_LABELS: Record<Prompt2BlogPipelineStage, string> = {
  queued: 'Queued',
  stage_input_validate: 'Validate inputs',
  stage_input_cleanup: 'Clean source material',
  stage_synthesize_sources: 'Synthesize source material',
  stage_guideline_fetch: 'Fetch article guidelines',
  stage_coverage_check: 'Check coverage against brief + guideline',
  stage_supplement: 'Generate supplemental sections (if needed)',
  stage_compose: 'Compose full draft',
  stage_quality_audit: 'Audit draft quality and constraints',
  stage_repair: 'Repair pass (if needed)',
  stage_editorial_augmentation: 'Apply editorial blocks (if helpful)',
  stage_title: 'Generate final title',
  stage_finalize: 'Finalize markdown output',
  complete: 'Complete',
}

export function getPipelineStepStatus(
  step: Prompt2BlogPipelineStage,
  status: Prompt2BlogStatusResponse | null,
): PipelineStepStatus {
  if (!status) return step === 'queued' ? 'running' : 'pending'
  return getPipelineProgressState({
    step,
    status,
    stageOrder: PIPELINE_STAGE_ORDER,
    doneState: 'done',
    runningState: 'running',
    pendingState: 'pending',
    failedState: 'error',
  })
}
