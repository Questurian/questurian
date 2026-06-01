import type { Url2BlogStatusResponse } from '../types/pipeline.types'
import {
  URL2BLOG_PROGRESS_STEPS,
  type Url2BlogProgressStep,
} from '../constants/pipeline-ui.constants'

export type ProgressItemState = 'pending' | 'running' | 'done' | 'failed'

const PROGRESS_STAGE_ORDER = URL2BLOG_PROGRESS_STEPS
  .map((step) => step.stage)
  .filter((stage): stage is string => Boolean(stage))

export function getStageLabel(stage: string | null): string {
  if (stage === 'stage_1') return 'Stage 1: Extract article'
  if (stage === 'stage_2') return 'Stage 2: Classify article type'
  if (stage === 'editorial_blueprint') return 'Plan editorial blueprint'
  if (stage === 'rewrite_quality') return 'Rewrite + quality checks'
  if (stage === 'fact_length') return 'Fact retention + length checks'
  if (stage === 'editorial_augmentation') return 'Editorial augmentation'
  if (stage === 'editorial_post_recheck') return 'Post-editorial recheck'
  if (stage === 'complete') return 'Finalize output'
  return 'Preparing pipeline'
}

export function getProgressItemState(
  step: Url2BlogProgressStep,
  status: Url2BlogStatusResponse | null | undefined
): ProgressItemState {
  if (step.stage === null) return 'done'

  const activeStage = typeof status?.stage === 'string' ? status.stage : null
  const activeIndex = activeStage ? PROGRESS_STAGE_ORDER.indexOf(activeStage) : -1
  const itemIndex = PROGRESS_STAGE_ORDER.indexOf(step.stage)

  if (status?.state === 'completed') return 'done'
  if (status?.state === 'failed') {
    if (activeStage === step.stage) return 'failed'
    return activeIndex > itemIndex ? 'done' : 'pending'
  }
  if (activeIndex === -1) return 'pending'
  if (activeIndex > itemIndex) return 'done'
  if (activeIndex === itemIndex) return 'running'
  return 'pending'
}
