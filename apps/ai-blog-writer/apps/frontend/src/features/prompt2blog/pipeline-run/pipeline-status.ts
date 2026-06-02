import { CLEANUP_STAGE_KEY } from '../cleanup-details/cleanup-stage.parser'
import type { Prompt2BlogPipelineStage, Prompt2BlogStatusResponse } from '../api'
import type { PipelineStepStatus } from './pipeline-run.types'

export const PIPELINE_STAGE_ORDER: readonly Prompt2BlogPipelineStage[] = [
  'queued', 'stage_input_validate', 'stage_input_cleanup', 'stage_synthesize_sources',
  'stage_guideline_fetch', 'stage_coverage_check', 'stage_supplement', 'stage_compose',
  'stage_quality_audit', 'stage_repair', 'stage_editorial_augmentation', 'stage_title',
  'stage_finalize', 'complete',
] as const

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

interface PipelineStageMetadataOptions {
  canOpenCleanupModal: boolean
  onOpenCleanupModal: () => void
}

export interface PipelineStageMetadata {
  key: Prompt2BlogPipelineStage
  label: string
  status: PipelineStepStatus
  interactive: boolean
  onClick?: () => void
  ariaLabel?: string
  detailLabel?: string
}

export function getPipelineStageMetadata(
  status: Prompt2BlogStatusResponse | null,
  options: PipelineStageMetadataOptions,
): PipelineStageMetadata[] {
  return PIPELINE_STAGE_ORDER.map(step => {
    const isCleanupDetailStep = step === CLEANUP_STAGE_KEY && options.canOpenCleanupModal

    return {
      key: step,
      label: PIPELINE_STAGE_LABELS[step] || step,
      status: getPipelineStepStatus(step, status),
      interactive: isCleanupDetailStep,
      onClick: isCleanupDetailStep ? options.onOpenCleanupModal : undefined,
      ariaLabel: isCleanupDetailStep ? 'View clean source material details' : undefined,
      detailLabel: isCleanupDetailStep ? 'View details' : undefined,
    }
  })
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
