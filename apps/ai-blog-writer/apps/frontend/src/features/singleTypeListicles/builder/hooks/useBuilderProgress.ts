import { useMemo } from 'react'
import { useBuilderProgress as useSharedBuilderProgress } from '../../../../shared/builder/hooks/useBuilderProgress'
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
  const { stepIssues, isSetupReady, completionPercent } = useSharedBuilderProgress<SingleTypeListicleDraft>(
    draft,
    { validateStep1, isSeoCoreComplete, requiresStep2Lock: false },
  )

  const hasTargetCount = useMemo(() => {
    if (!draft) return false
    return draft.targetItemCount > 0 && draft.items.length === draft.targetItemCount
  }, [draft])

  return { stepIssues, isSetupReady, hasTargetCount, completionPercent }
}
