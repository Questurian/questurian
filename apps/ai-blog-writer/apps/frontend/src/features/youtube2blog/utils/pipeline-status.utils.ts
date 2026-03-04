import type { StatusResponse } from '@shared/types'

import { PIPELINE_TIMELINE, STAGE_LABELS, STAGE_ORDER } from '../constants/pipeline.constants'

export type TimelineStep = (typeof PIPELINE_TIMELINE)[number]

function getStageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number])
}

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
  if (step.optional) {
    if (status.stage === step.key && status.state === 'running') {
      return getRunningPhaseLabel(step.key)
    }
    if (status.stage === step.key && status.state === 'failed') {
      return 'Failed'
    }
    return 'Conditional'
  }

  const activeIndex = getStageIndex(status.stage)
  const checklistIndex = getStageIndex(step.key)

  if (activeIndex === -1 || checklistIndex === -1) {
    return 'Pending'
  }
  if (status.state === 'completed') {
    return 'Completed'
  }
  if (status.state === 'failed' && status.stage === step.key) {
    return 'Failed'
  }
  if (activeIndex > checklistIndex) {
    return 'Completed'
  }
  if (activeIndex === checklistIndex && status.state === 'running') {
    return getRunningPhaseLabel(step.key)
  }
  if (activeIndex === checklistIndex) {
    return 'Completed'
  }
  return 'Pending'
}

export function getStageItemState(
  status: StatusResponse,
  step: TimelineStep
): 'done' | 'running' | 'pending' {
  if (step.optional) {
    if (status.stage === step.key && status.state === 'running') {
      return 'running'
    }
    if (status.stage === step.key && status.state === 'failed') {
      return 'running'
    }
    return 'pending'
  }

  const activeIndex = getStageIndex(status.stage)
  const checklistIndex = getStageIndex(step.key)

  if (activeIndex === -1 || checklistIndex === -1) {
    return 'pending'
  }

  if (status.state === 'completed') {
    return 'done'
  }
  if (status.stage === step.key && status.state === 'running') {
    return 'running'
  }
  if (status.state === 'failed' && status.stage === step.key) {
    return 'running'
  }
  return activeIndex > checklistIndex ? 'done' : 'pending'
}
