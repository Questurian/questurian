import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import {
  areLocationIdSelectionsEqual,
  normalizeLocationIds,
  normalizeLocationKey,
} from '../../../../shared/locationScope/scope'
import {
  useBuilderStepActions,
  useSelectedLocationRefId,
} from '../../../../shared/builder/hooks/useBuilderStepActions'
import { createEmptyDraft, removeDraft } from '../../storage'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import { validateStep1 } from '../validators/setup.validators'
import { validateStep3 } from '../validators/step.validators'
import {
  createEmptyDaySlice,
  resolveItineraryStopIdentityKey,
  WHERE_STAYING_BLOCK_TYPE,
} from '../../types'

/**
 * Run an item updater, then invalidate the Selection reason and blurb if the
 * stop's resolved identity changed (a swap). Both describe the previous venue,
 * so clearing them re-arms the why-gate and forces a day recompose (ADR 0020).
 */
function applyItemUpdate(
  item: ItineraryItemBlock,
  updater: (item: ItineraryItemBlock) => ItineraryItemBlock,
): ItineraryItemBlock {
  const next = updater(item)
  if (resolveItineraryStopIdentityKey(next) === resolveItineraryStopIdentityKey(item)) {
    return next
  }
  return {
    ...next,
    selectionReason: '',
    blurbMarkdown: '',
    blurbJsonText: '',
    blurbLexical: undefined,
  }
}

function createNewItem(): ItineraryItemBlock {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    blockType: 'itinerary-dining',
    item: null,
    tours: [],
    mediaMode: 'photos',
    selectedPhotos: [],
    selectedInstagramPost: null,
    title: '',
    operator: '',
    price: '',
    url: '',
    tourDuration: 1,
    startingPoint: {
      label: '',
      latitude: '',
      longitude: '',
    },
    keyLocations: [],
    image: null,
    instagramPost: null,
    blurbMarkdown: '',
    blurbLexical: undefined,
    blurbJsonText: '',
    // Operator-added stop: no Autobuild rationale. Empty string (not undefined)
    // so the "Why this pick" field renders and the day-compose gate sees it as
    // an unfilled reason to prompt for (ADR 0020).
    selectionReason: '',
  }
}

function createNewWhereStayingItem(): ItineraryItemBlock {
  return {
    ...createNewItem(),
    blockType: WHERE_STAYING_BLOCK_TYPE,
  }
}

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
  updateItem: (itemId: string, updater: (item: ItineraryItemBlock) => ItineraryItemBlock) => void
  removeItem: (itemId: string) => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  addItem: (dayIndex: number, insertIndex?: number) => void
  addWhereStayingItem: (dayIndex: number) => void
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

  const selectedLocationRefId = useSelectedLocationRefId(draft, locations)

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

  const stepActions = useBuilderStepActions<ListicleItineraryDraft>({
    draft,
    updateDraft: (next) => updateDraft(next as Partial<ListicleItineraryDraft>),
    selectedLocationRefId,
    validateStep1,
    // Step 2 (header) is intentionally not gated for navigation/locking — moving
    // 2 -> 3 must never be blocked by an empty intro. The intro requirement is
    // still enforced before Payload sync via validateStep2 in useItinerarySubmit.
    validateStep2: () => [],
    validateStep3: (d) => validateStep3(d, relatedByBlockType),
    onError,
  })

  function updateHeader(next: Partial<ListicleItineraryDraft['header']>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        header: { ...current.header, ...next },
      }
    })
  }

  function updateItem(itemId: string, updater: (item: ItineraryItemBlock) => ItineraryItemBlock) {
    setDraft((current) => {
      if (!current) return current
      const nextDays = current.days.map((day) => {
        if (day.whereStaying.some((item) => item.id === itemId)) {
          return {
            ...day,
            whereStaying: day.whereStaying.map((item) =>
              item.id === itemId ? applyItemUpdate(item, updater) : item,
            ),
          }
        }
        if (day.items.some((item) => item.id === itemId)) {
          return {
            ...day,
            items: day.items.map((item) =>
              item.id === itemId ? applyItemUpdate(item, updater) : item,
            ),
          }
        }
        return day
      })
      return { ...current, days: nextDays }
    })
  }

  function removeItem(itemId: string) {
    setDraft((current) => {
      if (!current) return current
      const nextDays = current.days.map((day) => {
        if (day.whereStaying.some((item) => item.id === itemId)) {
          return {
            ...day,
            whereStaying: day.whereStaying.filter((item) => item.id !== itemId),
          }
        }
        if (day.items.some((item) => item.id === itemId)) {
          return {
            ...day,
            items: day.items.filter((item) => item.id !== itemId),
          }
        }
        return day
      })
      return { ...current, days: nextDays }
    })
  }

  function moveItem(itemId: string, direction: 'up' | 'down') {
    setDraft((current) => {
      if (!current) return current
      const nextDays = current.days.map((day) => {
        const wsIndex = day.whereStaying.findIndex((item) => item.id === itemId)
        if (wsIndex >= 0) {
          const whereStaying = [...day.whereStaying]
          const target = direction === 'up' ? wsIndex - 1 : wsIndex + 1
          if (target < 0 || target >= whereStaying.length) return day
          const [row] = whereStaying.splice(wsIndex, 1)
          whereStaying.splice(target, 0, row)
          return { ...day, whereStaying }
        }
        const items = [...day.items]
        const index = items.findIndex((item) => item.id === itemId)
        if (index < 0) return day
        const target = direction === 'up' ? index - 1 : index + 1
        if (target < 0 || target >= items.length) return day
        const [item] = items.splice(index, 1)
        items.splice(target, 0, item)
        return { ...day, items }
      })
      return { ...current, days: nextDays }
    })
  }

  function addItem(dayIndex: number, insertIndex?: number) {
    setDraft((current) => {
      if (!current) return current
      const day = current.days[dayIndex]
      if (!day) return current
      const items = [...day.items]
      // Clamp so an out-of-range index can't drop the stop or throw; undefined = append.
      const at = insertIndex === undefined
        ? items.length
        : Math.max(0, Math.min(insertIndex, items.length))
      items.splice(at, 0, createNewItem())
      const nextDays = [...current.days]
      nextDays[dayIndex] = { ...day, items }
      return { ...current, days: nextDays }
    })
  }

  function addWhereStayingItem(dayIndex: number) {
    setDraft((current) => {
      if (!current) return current
      const day = current.days[dayIndex]
      if (!day) return current
      const nextDays = [...current.days]
      nextDays[dayIndex] = {
        ...day,
        whereStaying: [...day.whereStaying, createNewWhereStayingItem()],
      }
      return { ...current, days: nextDays }
    })
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

    if (
      (locationChanged || sharedNeighborhoodsChanged)
      && draft.days.some((d) => d.items.length > 0 || d.whereStaying.length > 0)
    ) {
      const confirmed = window.confirm(
        'Changing location or shared neighborhoods clears lodging and itinerary stops. Continue?',
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
          locationRef: selectedLocationRefId,
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
          locationRef: selectedLocationRefId ?? current.locationRef,
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
    updateItem,
    removeItem,
    moveItem,
    addItem,
    addWhereStayingItem,
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
    handleDiscardLocalDraft,
  }
}
