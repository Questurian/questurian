import {
  PROMPT2BLOG_PIPELINE_STAGES,
  type Prompt2BlogPipelineStage,
  type Prompt2BlogStatusResponse,
} from '../types/pipeline.types'
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
  const activeIndex = PIPELINE_STAGE_ORDER.indexOf(status.stage)
  const stepIndex = PIPELINE_STAGE_ORDER.indexOf(step)
  if (status.state === 'failed') {
    if (step === status.stage) return 'error'
    return stepIndex < activeIndex ? 'done' : 'pending'
  }
  if (status.state === 'completed') {
    return step === 'complete' || stepIndex <= activeIndex ? 'done' : 'pending'
  }
  if (step === status.stage) return 'running'
  return stepIndex < activeIndex ? 'done' : 'pending'
}
