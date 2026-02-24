import { useMemo } from 'react'
import type { ListicleItineraryDraft } from '../../types'
import { hasContinuousCoverage } from '../services/itinerary-timeline.service'
import { validateStep1 } from '../validators/setup.validators'

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
            hasContinuous ? 1 : 0,
            draft.seoSection.seo ? 1 : 0,
          ].reduce((sum, value) => sum + value, 0) /
            6) *
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
