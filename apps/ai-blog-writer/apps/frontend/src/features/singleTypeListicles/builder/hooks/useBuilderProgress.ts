import { useMemo } from 'react'
import type { SingleTypeListicleDraft } from '../../types'
import { validateStep1 } from '../validators/setup.validators'

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
    const completionPercent = Math.max(
      8,
      Math.min(
        100,
        Math.round(
          ([
            draft.step1_complete ? 1 : 0,
            draft.header.featuredImage ? 1 : 0,
            (draft.header.introMarkdown || draft.header.introJsonText || '').trim() ? 1 : 0,
            draft.items.length > 0 ? 1 : 0,
            hasTargetCount ? 1 : 0,
            draft.seoSection.seo ? 1 : 0,
          ].reduce((sum, value) => sum + value, 0) /
            6) *
            100,
        ),
      ),
    )

    return { stepIssues, isSetupReady, hasTargetCount, completionPercent }
  }, [draft])
}
