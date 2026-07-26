import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import {
  areLocationIdSelectionsEqual,
  normalizeLocationIds
} from '../../../../shared/locationScope/ids'
import { normalizeLocationKey } from '../../../../shared/locationScope/keys'
import {
  useBuilderStepActions,
  useSelectedLocationRefId
} from '../../../../shared/builder/hooks/useBuilderStepActions'
import { createEmptyDraft, removeDraft } from '../../storage'
import {
  createEmptyDaySlice,
  type ItineraryBlockType,
  type ListicleItineraryDraft,
  type LocationOption,
  type RelatedItemOption
} from '../../types'
import { validateStep1 } from '../validators/setup.validators'
import { validateStep3 } from '../validators/step.validators'
import {
  useItineraryItemActions,
  type ItineraryItemActions
} from './useItineraryItemActions'

type UseBuilderDraftActionsParams = {
  draft: ListicleItineraryDraft | null
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  locations: LocationOption[]
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  navigate: (to: string) => void
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

type UseBuilderDraftActionsResult = {
  selectedLocationRefId: number | null
  updateDraft: (next: Partial<ListicleItineraryDraft>) => void
  updateHeader: (next: Partial<ListicleItineraryDraft['header']>) => void
  handleContinue: () => void
  handleUpdateSetup: () => void
  handleSaveSetup: () => void
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
  handleDiscardLocalDraft: () => void
} & ItineraryItemActions

export function useBuilderDraftActions({
  draft,
  setDraft,
  locations,
  relatedByBlockType,
  navigate,
  setSearchParams,
  onError,
  setResult
}: UseBuilderDraftActionsParams): UseBuilderDraftActionsResult {
  const [setupBaseline, setSetupBaseline] = useState<{
    location: string
    sharedNeighborhoods: number[]
  } | null>(null)

  const selectedLocationRefId = useSelectedLocationRefId(draft, locations)
  const itemActions = useItineraryItemActions(setDraft)

  function updateDraft(next: Partial<ListicleItineraryDraft>) {
    setDraft((current) => {
      if (!current) return current
      const locationChanged =
        typeof next.location === 'string' &&
        normalizeLocationKey(next.location) !==
          normalizeLocationKey(current.location)
      return {
        ...current,
        ...next,
        sharedNeighborhoods:
          'sharedNeighborhoods' in next
            ? normalizeLocationIds(next.sharedNeighborhoods)
            : locationChanged
              ? []
              : current.sharedNeighborhoods
      }
    })
  }

  const stepActions = useBuilderStepActions<ListicleItineraryDraft>({
    draft,
    updateDraft: (next) => updateDraft(next as Partial<ListicleItineraryDraft>),
    selectedLocationRefId,
    validateStep1,
    // Step 2 can be skipped while building. Payload sync still validates its
    // schema-required content, but no later editor step depends on its lock.
    validateStep2: () => [],
    step2GatesStep3: false,
    validateStep3: (d) => validateStep3(d, relatedByBlockType),
    onError
  })

  function updateHeader(next: Partial<ListicleItineraryDraft['header']>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        header: { ...current.header, ...next }
      }
    })
  }

  function handleUpdateSetup() {
    if (!draft) return
    setSetupBaseline({
      location: draft.location,
      sharedNeighborhoods: [...draft.sharedNeighborhoods]
    })
    updateDraft({ in_update_mode: true })
    onError('')
  }

  function handleSaveSetup() {
    if (!draft) return

    const issues = validateStep1(draft)
    if (issues.length > 0) {
      onError(issues.join('. '))
      return
    }

    const locationChanged = setupBaseline
      ? normalizeLocationKey(setupBaseline.location) !==
        normalizeLocationKey(draft.location)
      : false
    const sharedNeighborhoodsChanged = setupBaseline
      ? !areLocationIdSelectionsEqual(
          setupBaseline.sharedNeighborhoods,
          draft.sharedNeighborhoods
        )
      : false

    if (
      (locationChanged || sharedNeighborhoodsChanged) &&
      draft.days.some((d) => d.items.length > 0 || d.whereStaying.length > 0)
    ) {
      const confirmed = window.confirm(
        'Changing location or shared neighborhoods clears lodging and itinerary stops. Continue?'
      )
      if (!confirmed) return
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          days: current.days.map(() => createEmptyDaySlice()),
          in_update_mode: false,
          step1_complete: true,
          step2_complete: false,
          step2_in_update_mode: false,
          step3_complete: false,
          step3_in_update_mode: false,
          locationRef: selectedLocationRefId
        }
      })
      setSetupBaseline(null)
      onError('')
      return
    }

    if (locationChanged || sharedNeighborhoodsChanged) {
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          days: current.days.map(() => createEmptyDaySlice()),
          in_update_mode: false,
          step1_complete: true,
          step2_complete: false,
          step2_in_update_mode: false,
          step3_complete: false,
          step3_in_update_mode: false,
          locationRef: selectedLocationRefId ?? current.locationRef
        }
      })
      setSetupBaseline(null)
      onError('')
      return
    }

    updateDraft({
      in_update_mode: false,
      step1_complete: true,
      step2_complete: false,
      step2_in_update_mode: false,
      step3_complete: false,
      step3_in_update_mode: false,
      locationRef: selectedLocationRefId
    })
    setSetupBaseline(null)
    onError('')
  }

  function cancelUpdateSetup() {
    if (!draft) return
    updateDraft({ in_update_mode: false })
    setSetupBaseline(null)
    onError('')
  }

  function handleDiscardLocalDraft() {
    if (!draft) return
    removeDraft(draft.draftId)
    if (draft.payloadId) {
      navigate(`/listicle-itineraries/builder?id=${draft.payloadId}`)
    } else {
      const fresh = createEmptyDraft()
      setDraft(fresh)
      setSearchParams({ draftId: fresh.draftId }, { replace: true })
    }
    setResult('Local staged draft discarded')
  }

  return {
    selectedLocationRefId,
    updateDraft,
    updateHeader,
    ...itemActions,
    handleContinue: stepActions.handleContinue,
    handleUpdateSetup,
    handleSaveSetup,
    cancelUpdateSetup,
    handleContinueStep2: stepActions.handleContinueStep2,
    handleUpdateStep2: stepActions.handleUpdateStep2,
    handleSaveStep2: stepActions.handleSaveStep2,
    cancelUpdateStep2: stepActions.cancelUpdateStep2,
    handleContinueStep3: stepActions.handleContinueStep3,
    handleUpdateStep3: stepActions.handleUpdateStep3,
    handleSaveStep3: stepActions.handleSaveStep3,
    cancelUpdateStep3: stepActions.cancelUpdateStep3,
    setEditorModelName: stepActions.setEditorModelName,
    handleDiscardLocalDraft
  }
}
