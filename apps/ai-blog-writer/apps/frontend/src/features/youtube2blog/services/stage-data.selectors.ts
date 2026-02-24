import type { DebugResponse } from '../api'
import type {
  Stage1Data,
  Stage2Data,
  Stage3Data,
  Stage4Data,
  StageEditorialAugmentationData,
  TypedDebugStages,
} from '../types/youtube2blog.types'

function getStages(debugData?: DebugResponse): TypedDebugStages {
  return (debugData?.stages as TypedDebugStages) ?? {}
}

export function getStage1Data(debugData?: DebugResponse): Stage1Data | undefined {
  return getStages(debugData).stage_1?.data
}

export function getStage2Data(debugData?: DebugResponse): Stage2Data | undefined {
  return getStages(debugData).stage_2?.data
}

export function getStage3Data(debugData?: DebugResponse): Stage3Data | undefined {
  return getStages(debugData).stage_3?.data
}

export function getStageEditorialAugmentationData(
  debugData?: DebugResponse
): StageEditorialAugmentationData | undefined {
  return getStages(debugData).stage_editorial_augmentation?.data
}

export function getStage4Data(debugData?: DebugResponse): Stage4Data | undefined {
  return getStages(debugData).stage_4?.data
}

export function getStage0Data(debugData?: DebugResponse): unknown {
  return getStages(debugData).stage_0?.data ?? {}
}
