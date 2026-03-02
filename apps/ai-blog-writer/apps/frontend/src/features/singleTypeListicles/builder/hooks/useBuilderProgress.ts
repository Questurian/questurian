import { useMemo } from 'react'
import type { SingleTypeListicleDraft } from '../../types'
import { validateStep1 } from '../validators/setup.validators'
import { isSeoCoreComplete } from '../validators/submit.validators'

type UseBuilderProgressResult = {
  stepIssues: string[]
  isSetupReady: boolean
  hasTargetCount: boolean
  completionPercent: number
}

export function useBuilderProgress(draft: SingleTypeListicleDraft | null): UseBuilderProgressResult {
  return useMemo(() => {
    if (!draft) {
      return {
        stepIssues: [],
        isSetupReady: false,
        hasTargetCount: false,
        completionPercent: 0,
      }
    }

    const stepIssues = validateStep1(draft)
    const isSetupReady = stepIssues.length === 0
    const hasTargetCount = draft.targetItemCount > 0 && draft.items.length === draft.targetItemCount
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

    return { stepIssues, isSetupReady, hasTargetCount, completionPercent }
  }, [draft])
}
