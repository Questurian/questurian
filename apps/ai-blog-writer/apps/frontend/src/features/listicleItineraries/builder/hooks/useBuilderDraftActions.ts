import type { Dispatch, SetStateAction } from 'react'
import { useMemo, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import {
  areLocationIdSelectionsEqual,
  findLocationByKey,
  normalizeLocationIds,
  normalizeLocationKey,
} from '../../../locationScope/scope'
import { resolveEditorAssistModelName } from '../../../staging/api/ai/models'
import { createEmptyDraft, removeDraft } from '../../storage'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import { autoChainItems, createNewItem, withEndAlignedToLastItem } from '../services/itinerary-timeline.service'
import { validateStep1 } from '../validators/setup.validators'
import { validateStep2, validateStep3 } from '../validators/step.validators'

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
  endHereOnLastStop: () => void
  updateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock,
    options?: { cascadeSchedule?: boolean },
  ) => void
  removeItem: (itemId: string) => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  addItem: () => void
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
}

export function useBuilderDraftActions({
  draft,
  setDraft,
  locations,
  relatedByBlockType,
  navigate,
  setSearchParams,
  onError,
  setResult,
}: UseBuilderDraftActionsParams): UseBuilderDraftActionsResult {
  const [setupBaseline, setSetupBaseline] = useState<{
    location: string
    sharedNeighborhoods: number[]
  } | null>(null)

  const selectedLocationRefId = useMemo(() => {
    const fallbackLocationRef = (
      typeof draft?.locationRef === 'number'
      && Number.isFinite(draft.locationRef)
      && draft.locationRef > 0
    )
      ? draft.locationRef
      : null

    if (!draft?.location) return fallbackLocationRef
    const selected = findLocationByKey(locations, draft.location)
    return selected?.id || fallbackLocationRef
  }, [draft?.location, draft?.locationRef, locations])

  function updateDraft(next: Partial<ListicleItineraryDraft>) {
    setDraft((current) => {
      if (!current) return current
      const locationChanged = (
        typeof next.location === 'string'
        && normalizeLocationKey(next.location) !== normalizeLocationKey(current.location)
      )
      return {
        ...current,
        ...next,
        sharedNeighborhoods: 'sharedNeighborhoods' in next
          ? normalizeLocationIds(next.sharedNeighborhoods)
          : locationChanged
            ? []
            : current.sharedNeighborhoods,
      }
    })
  }

  function updateHeader(next: Partial<ListicleItineraryDraft['header']>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        header: {
          ...current.header,
          ...next,
        },
      }
    })
  }

  function endHereOnLastStop() {
    setDraft((current) => {
      if (!current || current.items.length === 0) return current
      return withEndAlignedToLastItem(current)
    })
  }

  function updateItem(
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock,
    options?: { cascadeSchedule?: boolean },
  ) {
    setDraft((current) => {
      if (!current) return current
      const index = current.items.findIndex((item) => item.id === itemId)
      if (index < 0) return current

      const next: ListicleItineraryDraft = {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? updater(item) : item)),
      }

      if (options?.cascadeSchedule) {
        return autoChainItems(next, index + 1)
      }

      return {
        ...next,
      }
    })
  }

  function removeItem(itemId: string) {
    setDraft((current) => {
      if (!current) return current
      const next: ListicleItineraryDraft = {
        ...current,
        items: current.items.filter((item) => item.id !== itemId),
      }
      return autoChainItems(next, 1)
    })
  }

  function moveItem(itemId: string, direction: 'up' | 'down') {
    setDraft((current) => {
      if (!current) return current
      const items = [...current.items]
      const index = items.findIndex((item) => item.id === itemId)
      if (index < 0) return current
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= items.length) return current
      const [item] = items.splice(index, 1)
      items.splice(target, 0, item)
      const next: ListicleItineraryDraft = {
        ...current,
        items,
      }
      return autoChainItems(next, 1)
    })
  }

  function addItem() {
    setDraft((current) => {
      if (!current) return current
      const next: ListicleItineraryDraft = {
        ...current,
        items: [...current.items, createNewItem(current)],
      }
      return autoChainItems(next, next.items.length - 1)
    })
  }

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

  function handleUpdateSetup() {
    if (!draft) return
    setSetupBaseline({
      location: draft.location,
      sharedNeighborhoods: [...draft.sharedNeighborhoods],
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
      ? normalizeLocationKey(setupBaseline.location) !== normalizeLocationKey(draft.location)
      : false
    const sharedNeighborhoodsChanged = setupBaseline
      ? !areLocationIdSelectionsEqual(setupBaseline.sharedNeighborhoods, draft.sharedNeighborhoods)
      : false

    if ((locationChanged || sharedNeighborhoodsChanged) && draft.items.length > 0) {
      const confirmed = window.confirm(
        'Changing location or shared neighborhoods clears current itinerary stops. Continue?',
      )
      if (!confirmed) return
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          items: [],
          in_update_mode: false,
          step1_complete: true,
          step2_complete: false,
          step2_in_update_mode: false,
          step3_complete: false,
          step3_in_update_mode: false,
          locationRef: selectedLocationRefId,
        }
      })
      setSetupBaseline(null)
      onError('')
      return
    }

    if (locationChanged || sharedNeighborhoodsChanged) {
      updateDraft({
        items: [],
        in_update_mode: false,
        step1_complete: true,
        step2_complete: false,
        step2_in_update_mode: false,
        step3_complete: false,
        step3_in_update_mode: false,
        locationRef: selectedLocationRefId,
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
      locationRef: selectedLocationRefId,
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

    const issues = validateStep3(draft, relatedByBlockType)
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

    const issues = validateStep3(draft, relatedByBlockType)
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
    endHereOnLastStop,
    updateItem,
    removeItem,
    moveItem,
    addItem,
    handleContinue,
    handleUpdateSetup,
    handleSaveSetup,
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
    handleDiscardLocalDraft,
  }
}
