import { useMemo } from 'react'
import { findLocationByKey } from '../../locationScope/scope'
import { resolveEditorAssistModelName } from '../../api/ai/models'

type StepFlags = {
  step1_complete: boolean
  in_update_mode: boolean
  step2_complete: boolean
  step2_in_update_mode: boolean
  step3_complete: boolean
  step3_in_update_mode: boolean
  location?: string
  locationRef?: number | null
}

type LocationLike = { id: number; locationKey: string }

type StepFlagsPatch = Partial<StepFlags & { editorModelName: string; locationRef: number | null }>

export type UseBuilderStepActionsParams<TDraft extends StepFlags> = {
  draft: TDraft | null
  /**
   * Accepts step-flag patches plus a couple of common fields. Feature wrappers
   * typically have a stricter `(next: Partial<TFeatureDraft>) => void`; pass that
   * directly — the shared hook only ever passes patches with these known keys.
   */
  updateDraft: (next: StepFlagsPatch) => void
  selectedLocationRefId: number | null
  validateStep1: (draft: TDraft) => string[]
  validateStep2: (draft: TDraft) => string[]
  /** Closure over the feature-specific Step-3 context (relatedItems / relatedByBlockType). */
  validateStep3: (draft: TDraft) => string[]
  onError: (message: string) => void
}

export type UseBuilderStepActionsResult = {
  handleContinue: () => void
  cancelUpdateSetup: () => void
  handleContinueStep2: () => void
  handleUpdateStep2: () => void
  handleSaveStep2: () => void
  cancelUpdateStep2: () => void
  handleContinueStep3: () => void
  handleUpdateStep3: () => void
  handleSaveStep3: () => void
  cancelUpdateStep3: () => void
  setEditorModelName: (modelName: string) => void
}

export function useSelectedLocationRefId(
  draft: { location?: string; locationRef?: number | null } | null,
  locations: LocationLike[],
): number | null {
  return useMemo(() => {
    const fallbackLocationRef = (
      typeof draft?.locationRef === 'number'
      && Number.isFinite(draft.locationRef)
      && draft.locationRef > 0
    )
      ? draft.locationRef
      : null

    const locationKey = draft?.location?.trim() || ''
    if (!locationKey) return fallbackLocationRef

    const selected = findLocationByKey(locations, locationKey)
    return selected?.id || fallbackLocationRef
  }, [draft?.location, draft?.locationRef, locations])
}

export function useBuilderStepActions<TDraft extends StepFlags>({
  draft,
  updateDraft,
  selectedLocationRefId,
  validateStep1,
  validateStep2,
  validateStep3,
  onError,
}: UseBuilderStepActionsParams<TDraft>): UseBuilderStepActionsResult {
  function handleContinue() {
    if (!draft) return
    const issues = validateStep1(draft)
    if (issues.length > 0) {
      onError(issues.join('. '))
      return
    }
    updateDraft({
      step1_complete: true,
      in_update_mode: false,
      locationRef: selectedLocationRefId,
      step2_complete: false,
      step2_in_update_mode: false,
      step3_complete: false,
      step3_in_update_mode: false,
    })
    onError('')
  }

  function cancelUpdateSetup() {
    if (!draft) return
    updateDraft({ in_update_mode: false })
    onError('')
  }

  function handleContinueStep2() {
    if (!draft) return
    const issues = validateStep2(draft)
    if (issues.length > 0) {
      onError(issues.join('. '))
      return
    }
    updateDraft({
      step2_complete: true,
      step2_in_update_mode: false,
      step3_complete: false,
      step3_in_update_mode: false,
    })
    onError('')
  }

  function handleUpdateStep2() {
    if (!draft) return
    updateDraft({ step2_in_update_mode: true })
    onError('')
  }

  function handleSaveStep2() {
    if (!draft) return
    const issues = validateStep2(draft)
    if (issues.length > 0) {
      onError(issues.join('. '))
      return
    }
    updateDraft({
      step2_complete: true,
      step2_in_update_mode: false,
      step3_complete: false,
      step3_in_update_mode: false,
    })
    onError('')
  }

  function cancelUpdateStep2() {
    if (!draft) return
    updateDraft({ step2_in_update_mode: false })
    onError('')
  }

  function handleContinueStep3() {
    if (!draft) return
    const issues = validateStep3(draft)
    if (issues.length > 0) {
      onError(issues.join('. '))
      return
    }
    updateDraft({
      step3_complete: true,
      step3_in_update_mode: false,
    })
    onError('')
  }

  function handleUpdateStep3() {
    if (!draft) return
    updateDraft({ step3_in_update_mode: true })
    onError('')
  }

  function handleSaveStep3() {
    if (!draft) return
    const issues = validateStep3(draft)
    if (issues.length > 0) {
      onError(issues.join('. '))
      return
    }
    updateDraft({
      step3_complete: true,
      step3_in_update_mode: false,
    })
    onError('')
  }

  function cancelUpdateStep3() {
    if (!draft) return
    updateDraft({ step3_in_update_mode: false })
    onError('')
  }

  function setEditorModelName(modelName: string) {
    const normalizedModelName = resolveEditorAssistModelName(modelName)
    updateDraft({ editorModelName: normalizedModelName })
  }

  return {
    handleContinue,
    cancelUpdateSetup,
    handleContinueStep2,
    handleUpdateStep2,
    handleSaveStep2,
    cancelUpdateStep2,
    handleContinueStep3,
    handleUpdateStep3,
    handleSaveStep3,
    cancelUpdateStep3,
    setEditorModelName,
  }
}
