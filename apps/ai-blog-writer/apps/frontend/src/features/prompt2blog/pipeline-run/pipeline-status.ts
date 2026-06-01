import type { Prompt2BlogStatusResponse } from '../api'
import type { PipelineStepStatus } from './pipeline-run.types'

export const PIPELINE_STAGE_ORDER = [
  'queued', 'stage_input_validate', 'stage_input_cleanup', 'stage_synthesize_sources',
  'stage_guideline_fetch', 'stage_coverage_check', 'stage_supplement', 'stage_compose',
  'stage_quality_audit', 'stage_repair', 'stage_editorial_augmentation', 'stage_title',
  'stage_finalize', 'complete',
] as const

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
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
  step: string,
  status: Prompt2BlogStatusResponse | null,
): PipelineStepStatus {
  if (!status) return step === 'queued' ? 'running' : 'pending'
  const activeIndex = PIPELINE_STAGE_ORDER.indexOf(
    (status.stage || 'queued') as (typeof PIPELINE_STAGE_ORDER)[number],
  )
  const stepIndex = PIPELINE_STAGE_ORDER.indexOf(step as (typeof PIPELINE_STAGE_ORDER)[number])
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
