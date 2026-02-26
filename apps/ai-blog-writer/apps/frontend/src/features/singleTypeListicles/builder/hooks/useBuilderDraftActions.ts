import type { Dispatch, SetStateAction } from 'react'
import { useMemo, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../../staging/api/ai/models'
import { getBlockTypeForListicleType } from '../../api'
import { createEmptyDraft, removeDraft } from '../../storage'
import type { ListicleItemBlock, ListicleType, SingleTypeListicleDraft } from '../../types'
import { validateStep1 } from '../validators/setup.validators'

type UseBuilderDraftActionsParams = {
  draft: SingleTypeListicleDraft | null
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  locations: Array<{ id: number; locationKey: string }>
  navigate: (to: string) => void
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

type UseBuilderDraftActionsResult = {
  selectedLocationRefId: number | null
  updateDraft: (next: Partial<SingleTypeListicleDraft>) => void
  updateHeader: (next: Partial<SingleTypeListicleDraft['header']>) => void
  updateItem: (itemId: string, updater: (item: ListicleItemBlock) => ListicleItemBlock) => void
  removeItem: (itemId: string) => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  addItem: () => void
  handleContinue: () => void
  handleUpdateSetup: () => void
  handleSaveSetup: () => void
  cancelUpdateSetup: () => void
  setSeoId: (value: number | null) => void
  setEditorModelName: (modelName: string) => void
  handleDiscardLocalDraft: () => void
}

export function useBuilderDraftActions({
  draft,
  setDraft,
  locations,
  navigate,
  setSearchParams,
  onError,
  setResult,
}: UseBuilderDraftActionsParams): UseBuilderDraftActionsResult {
  const [setupBaseline, setSetupBaseline] = useState<{ location: string; listicleType: ListicleType | '' } | null>(null)

  const normalizeLocationKey = (value: string): string =>
    value.trim().toLowerCase().replace(/\s*\|\s*/g, '|')

  const selectedLocationRefId = useMemo(() => {
    const fallbackLocationRef = (
      typeof draft?.locationRef === 'number'
      && Number.isFinite(draft.locationRef)
      && draft.locationRef > 0
    )
      ? draft.locationRef
      : null

    const locationKey = draft?.location?.trim() || ''
    if (!locationKey) {
      return fallbackLocationRef
    }

    const normalizedLocationKey = normalizeLocationKey(locationKey)
    const selected = locations.find((location) => (
      normalizeLocationKey(location.locationKey) === normalizedLocationKey
    ))

    return selected?.id || fallbackLocationRef
  }, [draft?.location, draft?.locationRef, locations])

  function updateDraft(next: Partial<SingleTypeListicleDraft>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        ...next,
      }
    })
  }

  function updateHeader(next: Partial<SingleTypeListicleDraft['header']>) {
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

  function updateItem(itemId: string, updater: (item: ListicleItemBlock) => ListicleItemBlock) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? updater(item) : item)),
      }
    })
  }

  function removeItem(itemId: string) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.filter((item) => item.id !== itemId),
      }
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
      return {
        ...current,
        items,
      }
    })
  }

  function addItem() {
    if (!draft?.listicleType) {
      onError('Select a listicle type before adding items')
      return
    }

    const blockType = getBlockTypeForListicleType(draft.listicleType)
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: [
          ...current.items,
          {
            id: `item_${Date.now()}`,
            blockType,
            item: null,
            mediaMode: 'photos',
            selectedPhotos: [],
            selectedInstagramPost: null,
            blurbMarkdown: '',
            blurbJsonText: '',
          },
        ],
      }
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
    })
    onError('')
  }

  function handleUpdateSetup() {
    if (!draft) return
    setSetupBaseline({
      location: draft.location,
      listicleType: draft.listicleType,
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

    const prevType = setupBaseline?.listicleType
    const prevLocation = setupBaseline?.location

    const typeChanged = prevType && prevType !== draft.listicleType
    const locationChanged = prevLocation && prevLocation !== draft.location

    if ((typeChanged || locationChanged) && draft.items.length > 0) {
      const confirmed = window.confirm('Changing listicle type or location clears current list items. Continue?')
      if (!confirmed) return
      updateDraft({
        items: [],
        in_update_mode: false,
        step1_complete: true,
        locationRef: selectedLocationRefId,
      })
      setSetupBaseline(null)
      return
    }

    updateDraft({
      in_update_mode: false,
      step1_complete: true,
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

  function setSeoId(value: number | null) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        seoSection: {
          seo: value,
        },
      }
    })
  }

  function setEditorModelName(modelName: string) {
    const normalizedModelName = resolveEditorAssistModelName(modelName)
    updateDraft({ editorModelName: normalizedModelName })
  }

  function handleDiscardLocalDraft() {
    if (!draft) return
    removeDraft(draft.draftId)
    if (draft.payloadId) {
      navigate(`/single-type-listicles/builder?id=${draft.payloadId}`)
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
    handleContinue,
    handleUpdateSetup,
    handleSaveSetup,
    cancelUpdateSetup,
    setSeoId,
    setEditorModelName,
    handleDiscardLocalDraft,
  }
}
