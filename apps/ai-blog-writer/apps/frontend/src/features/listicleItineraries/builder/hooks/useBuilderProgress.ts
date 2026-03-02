import { useMemo } from 'react'
import type { ListicleItineraryDraft } from '../../types'
import { hasContinuousCoverage } from '../services/itinerary-timeline.service'
import { validateStep1 } from '../validators/setup.validators'
import { isSeoCoreComplete } from '../validators/step.validators'

type UseBuilderProgressParams = {
  draft: ListicleItineraryDraft | null
}

type UseBuilderProgressResult = {
  stepIssues: string[]
  isSetupReady: boolean
  hasContinuous: boolean
  completionPercent: number
}

export function useBuilderProgress({ draft }: UseBuilderProgressParams): UseBuilderProgressResult {
  return useMemo(() => {
    if (!draft) {
      return {
        stepIssues: [],
        isSetupReady: false,
        hasContinuous: false,
        completionPercent: 8,
      }
    }

    const stepIssues = validateStep1(draft)
    const isSetupReady = stepIssues.length === 0
    const hasContinuous = hasContinuousCoverage(draft)
    const seoCoreComplete = isSeoCoreComplete(draft)
    const isStep1Locked = draft.step1_complete && !draft.in_update_mode
    const isStep2Locked = draft.step2_complete && !draft.step2_in_update_mode
    const isStep3Locked = draft.step3_complete && !draft.step3_in_update_mode

    const completionPercent = Math.max(
      8,
      Math.min(
        100,
        Math.round(
          ([
            isStep1Locked ? 1 : 0,
            isStep2Locked ? 1 : 0,
            isStep3Locked ? 1 : 0,
            seoCoreComplete ? 1 : 0,
          ].reduce((sum, value) => sum + value, 0) /
            4) *
            100,
        ),
      ),
    )

    return {
      stepIssues,
      isSetupReady,
      hasContinuous,
      completionPercent,
    }
  }, [draft])
}
