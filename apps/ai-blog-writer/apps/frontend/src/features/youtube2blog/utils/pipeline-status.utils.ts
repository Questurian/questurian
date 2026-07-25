import type { StatusResponse } from '@shared/types'

import { PIPELINE_TIMELINE, STAGE_LABELS, STAGE_ORDER } from '../constants/pipeline.constants'
import { getStepStatus } from '../../pipelineRuns'

export type TimelineStep = (typeof PIPELINE_TIMELINE)[number]

function getRunningPhaseLabel(stage: string): string {
  switch (stage) {
    case 'stage_1':
      return 'Clean Transcript'
    case 'stage_1_quality_gate':
      return 'Check Transcript Quality'
    case 'stage_1_repair':
      return 'Repair Transcript'
    case 'stage_2':
      return 'Classify Article Type'
    case 'stage_2_quality_gate':
      return 'Check Classification Confidence'
    case 'stage_2_retry':
      return 'Re-classify Article Type'
    case 'stage_3_guideline':
      return 'Retrieve Guideline'
    case 'stage_3_coverage':
      return 'Analyze Coverage'
    case 'stage_3_supplement':
      return 'Generate Supplement'
    case 'stage_3':
      return 'Compose Article'
    case 'stage_3_quality_gate':
      return 'Evaluate Article Quality'
    case 'stage_3_improve':
      return 'Rewrite Article for Quality'
    case 'stage_seo_brief':
      return 'Generate SEO Brief'
    case 'stage_seo_enrich':
      return 'Enrich Article for SEO'
    case 'stage_seo_quality_gate':
      return 'Evaluate SEO Quality'
    case 'stage_seo_retry':
      return 'Retry SEO Enrichment'
    case 'stage_seo_rollback':
      return 'Restore Pre-SEO Article'
    case 'stage_editorial_gate':
      return 'Evaluate Editorial Gate'
    case 'stage_editorial_augmentation':
      return 'Apply Editorial Augmentation'
    case 'stage_editorial_skip':
      return 'Skip Editorial Augmentation'
    case 'stage_4':
      return 'Generate Title'
    case 'stage_5_quality_gate':
      return 'Evaluate Title Quality'
    case 'stage_5_retry':
      return 'Retry Title Generation'
    default:
      return 'Processing'
  }
}

export function getStageLabel(status: StatusResponse): string {
  if (status.stage === 'stage_0') {
    return status.run_id === 'dev-mode' ? 'Awaiting Data' : 'Data Received'
  }
  return STAGE_LABELS[status.stage] ?? status.stage.replace(/_/g, ' ').toUpperCase()
}

export function getStagePhase(status: StatusResponse, step: TimelineStep): string {
  const stepStatus = getStepStatus({
    step: step.key,
    status,
    stageOrder: STAGE_ORDER,
    optional: step.optional,
  })

  if (stepStatus === 'failed') {
    return 'Failed'
  }
  if (stepStatus === 'done') {
    return 'Completed'
  }
  if (stepStatus === 'running' && status.state === 'running') {
    return getRunningPhaseLabel(step.key)
  }
  if (step.optional) {
    return 'Conditional'
  }
  return 'Pending'
}

export function getStageItemState(
  status: StatusResponse,
  step: TimelineStep
): 'done' | 'running' | 'pending' {
  const stepStatus = getStepStatus({
    step: step.key,
    status,
    stageOrder: STAGE_ORDER,
    optional: step.optional,
  })
  return stepStatus === 'failed' ? 'running' : stepStatus
}
