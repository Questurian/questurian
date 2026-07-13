import { useBuilderProgress as useSharedBuilderProgress } from '../../../../shared/builder/hooks/useBuilderProgress'
import type { ListicleItineraryDraft } from '../../types'
import { validateStep1 } from '../validators/setup.validators'
import { isSeoCoreComplete } from '../validators/step.validators'

type UseBuilderProgressParams = {
  draft: ListicleItineraryDraft | null
}

type UseBuilderProgressResult = {
  stepIssues: string[]
  isSetupReady: boolean
  completionPercent: number
}

export function useBuilderProgress({ draft }: UseBuilderProgressParams): UseBuilderProgressResult {
  return useSharedBuilderProgress<ListicleItineraryDraft>(draft, {
    validateStep1,
    isSeoCoreComplete,
    requiresStep2Lock: false,
  })
}
