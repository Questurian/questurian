import type { StatusResponse } from '@shared/types'

import { STAGE_LABELS, STAGE_ORDER } from '../constants/pipeline.constants'

const CHECKLIST_STAGE_ORDER = [
  'stage_1',
  'stage_2',
  'stage_3',
  'stage_editorial_augmentation',
  'stage_4',
] as const

type ChecklistStageNumber = 1 | 2 | 3 | 4 | 5

function getChecklistStage(stageNum: ChecklistStageNumber): (typeof CHECKLIST_STAGE_ORDER)[number] {
  return CHECKLIST_STAGE_ORDER[stageNum - 1]
}

function getStageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number])
}

function getRunningPhaseLabel(stage: (typeof CHECKLIST_STAGE_ORDER)[number]): string {
  switch (stage) {
    case 'stage_1':
      return 'Clean Transcript'
    case 'stage_2':
      return 'Classify Article Type'
    case 'stage_3':
      return 'Compose Article'
    case 'stage_editorial_augmentation':
      return 'Apply Editorial Augmentation'
    case 'stage_4':
      return 'Generate Title'
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

export function getStagePhase(status: StatusResponse, stageNum: ChecklistStageNumber): string {
  const activeIndex = getStageIndex(status.stage)
  const checklistStage = getChecklistStage(stageNum)
  const checklistIndex = getStageIndex(checklistStage)

  if (activeIndex === -1 || checklistIndex === -1) {
    return 'Pending'
  }
  if (status.state === 'completed') {
    return 'Completed'
  }
  if (status.state === 'failed' && status.stage === checklistStage) {
    return 'Failed'
  }
  if (activeIndex > checklistIndex) {
    return 'Completed'
  }
  if (activeIndex === checklistIndex && status.state === 'running') {
    return getRunningPhaseLabel(checklistStage)
  }
  if (activeIndex === checklistIndex) {
    return 'Completed'
  }
  return 'Pending'
}

export function getStageItemState(
  status: StatusResponse,
  stageNum: ChecklistStageNumber
): 'done' | 'running' | 'pending' {
  const activeIndex = getStageIndex(status.stage)
  const checklistStage = getChecklistStage(stageNum)
  const checklistIndex = getStageIndex(checklistStage)

  if (activeIndex === -1 || checklistIndex === -1) {
    return 'pending'
  }

  if (status.state === 'completed') {
    return 'done'
  }
  if (status.stage === checklistStage && status.state === 'running') {
    return 'running'
  }
  if (status.state === 'failed' && status.stage === checklistStage) {
    return 'running'
  }
  return activeIndex > checklistIndex ? 'done' : 'pending'
}
