import type { StatusResponse } from '@shared/types'

import { STAGE_LABELS, STAGE_ORDER } from '../constants/pipeline.constants'

export function getStageLabel(status: StatusResponse): string {
  if (status.stage === 'stage_0') {
    return status.run_id === 'dev-mode' ? 'Awaiting Data' : 'Data Received'
  }
  return STAGE_LABELS[status.stage] ?? status.stage.replace(/_/g, ' ').toUpperCase()
}

export function getStagePhase(status: StatusResponse, stageNum: number): string {
  const stageIndex = STAGE_ORDER.indexOf(status.stage as (typeof STAGE_ORDER)[number])

  if (stageIndex === 0) {
    return 'Pending'
  }

  if (status.state === 'completed') {
    return 'Completed'
  }

  if (stageIndex > stageNum) {
    return 'Completed'
  }

  if (stageIndex === stageNum) {
    if (status.state === 'running') {
      switch (stageNum) {
        case 1:
          return 'Clean Transcript'
        case 2:
          return 'Classify Article Type'
        case 3:
          return 'Compose Article'
        case 4:
          return 'Generate Title'
        default:
          return 'Processing'
      }
    }
    return 'Completed'
  }

  return 'Pending'
}

export function getStageItemState(status: StatusResponse, stageNum: 1 | 2 | 3 | 4): 'done' | 'running' | 'pending' {
  const stageIndex = STAGE_ORDER.indexOf(status.stage as (typeof STAGE_ORDER)[number])

  if (status.state === 'completed') {
    return 'done'
  }

  if (status.stage === `stage_${stageNum}` && status.state === 'running') {
    return 'running'
  }

  if (stageNum === 1) {
    return stageIndex >= 2 ? 'done' : 'pending'
  }

  if (stageNum === 2) {
    return stageIndex >= 2 ? 'done' : 'pending'
  }

  if (stageNum === 3) {
    return stageIndex >= 3 ? 'done' : 'pending'
  }

  return stageIndex >= 4 ? 'done' : 'pending'
}
