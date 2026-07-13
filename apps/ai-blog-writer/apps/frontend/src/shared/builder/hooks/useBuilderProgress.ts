import { useMemo } from 'react'

type StepFlags = {
  step1_complete: boolean
  in_update_mode: boolean
  step2_complete: boolean
  step2_in_update_mode: boolean
  step3_complete: boolean
  step3_in_update_mode: boolean
}

type UseBuilderProgressValidators<TDraft> = {
  validateStep1: (draft: TDraft) => string[]
  isSeoCoreComplete: (draft: TDraft) => boolean
  requiresStep2Lock?: boolean
}

type UseBuilderProgressResult = {
  stepIssues: string[]
  isSetupReady: boolean
  completionPercent: number
}

export function useBuilderProgress<TDraft extends StepFlags>(
  draft: TDraft | null,
  { validateStep1, isSeoCoreComplete, requiresStep2Lock = true }: UseBuilderProgressValidators<TDraft>,
): UseBuilderProgressResult {
  return useMemo(() => {
    if (!draft) {
      return { stepIssues: [], isSetupReady: false, completionPercent: 8 }
    }

    const stepIssues = validateStep1(draft)
    const isSetupReady = stepIssues.length === 0
    const seoCoreComplete = isSeoCoreComplete(draft)
    const isStep1Locked = draft.step1_complete && !draft.in_update_mode
    const isStep2Locked = draft.step2_complete && !draft.step2_in_update_mode
    const isStep3Locked = draft.step3_complete && !draft.step3_in_update_mode

    const completionChecks = [
      isStep1Locked,
      isStep3Locked,
      seoCoreComplete,
      ...(requiresStep2Lock ? [isStep2Locked] : []),
    ]

    const completionPercent = Math.max(
      8,
      Math.min(
        100,
        Math.round(
          (completionChecks.filter(Boolean).length / completionChecks.length) * 100,
        ),
      ),
    )

    return { stepIssues, isSetupReady, completionPercent }
  }, [draft, validateStep1, isSeoCoreComplete, requiresStep2Lock])
}
