import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import {
  areLocationIdSelectionsEqual,
  normalizeLocationIds,
} from '../../../../shared/locationScope/ids'
import { normalizeLocationKey } from '../../../../shared/locationScope/keys'
import {
  useBuilderStepActions,
  useSelectedLocationRefId,
} from '../../../../shared/builder/hooks/useBuilderStepActions'
import { createEmptySeoSection } from '../services/seo-section.service'
import { createEmptyDraft, removeDraft } from '../../storage'
import type {
  ListicleItemBlock,
  ListicleType,
  LocationOption,
  RelatedItemOption,
  SingleTypeListicleDraft,
} from '../../types'
import {
  hasAnyWrittenItemData,
  isValidTargetItemCount,
  resizeItemsToTargetCount,
} from '../utils/item-target-count.utils'
import { validateStep1 } from '../validators/setup.validators'
import { validateStep3 } from '../validators/submit.validators'

type UseBuilderDraftActionsParams = {
  draft: SingleTypeListicleDraft | null
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  locations: LocationOption[]
  relatedItems: RelatedItemOption[]
  navigate: (to: string) => void
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

type UseBuilderDraftActionsResult = {
  selectedLocationRefId: number | null
  updateDraft: (next: Partial<SingleTypeListicleDraft>) => void
  setTargetItemCount: (nextCount: number) => void
  updateHeader: (next: Partial<SingleTypeListicleDraft['header']>) => void
  updateItem: (itemId: string, updater: (item: ListicleItemBlock) => ListicleItemBlock) => void
  removeItem: (itemId: string) => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void
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

const hasSeoContent = (draft: SingleTypeListicleDraft): boolean => {
  const { seoSection } = draft
  return Boolean(
    seoSection.seoTitle.trim()
    || seoSection.metaDescription.trim()
    || seoSection.openGraph.title.trim()
    || seoSection.openGraph.description.trim()
    || seoSection.openGraph.imageUrl.trim()
    || seoSection.openGraph.url.trim()
    || seoSection.twitterCard.title.trim()
    || seoSection.twitterCard.description.trim()
    || seoSection.twitterCard.imageUrl.trim()
    || seoSection.structuredData.trim(),
  )
}

export function useBuilderDraftActions({
  draft,
  setDraft,
  locations,
  relatedItems,
  navigate,
  setSearchParams,
  onError,
  setResult,
}: UseBuilderDraftActionsParams): UseBuilderDraftActionsResult {
  const [setupBaseline, setSetupBaseline] = useState<{
    location: string
    listicleType: ListicleType | ''
    sharedNeighborhoods: number[]
  } | null>(null)

  const hasResettableContent = (current: SingleTypeListicleDraft): boolean => (
    current.title.trim().length > 0
    || current.targetItemCount > 0
    || current.items.length > 0
    || current.header.featuredMediaSet != null
    || current.header.featuredImage !== null
    || current.header.introMarkdown.trim().length > 0
    || (current.header.introJsonText || '').trim().length > 0
    || hasSeoContent(current)
  )

  const selectedLocationRefId = useSelectedLocationRefId(draft, locations)

  function updateDraft(next: Partial<SingleTypeListicleDraft>) {
    setDraft((current) => {
      if (!current) return current

      const locationChanged = (
        typeof next.location === 'string'
        && normalizeLocationKey(next.location) !== normalizeLocationKey(current.location)
      )
      const shouldLockTargetCountEdit = (
        typeof next.targetItemCount === 'number'
        && next.targetItemCount !== current.targetItemCount
        && hasAnyWrittenItemData(current.items)
      )

      const normalizedSharedNeighborhoods = 'sharedNeighborhoods' in next
        ? normalizeLocationIds(next.sharedNeighborhoods)
        : locationChanged
          ? []
          : current.sharedNeighborhoods

      if (!shouldLockTargetCountEdit) {
        return {
          ...current,
          ...next,
          sharedNeighborhoods: normalizedSharedNeighborhoods,
        }
      }

      const safeNext = { ...next }
      delete safeNext.targetItemCount
      return {
        ...current,
        ...safeNext,
        sharedNeighborhoods: normalizedSharedNeighborhoods,
      }
    })
  }

  const stepActions = useBuilderStepActions<SingleTypeListicleDraft>({
    draft,
    updateDraft: (next) => updateDraft(next as Partial<SingleTypeListicleDraft>),
    selectedLocationRefId,
    validateStep1,
    validateStep2: () => [],
    step2GatesStep3: false,
    validateStep3: (d) => validateStep3(d, relatedItems),
    onError,
  })

  function setTargetItemCount(nextCount: number) {
    setDraft((current) => {
      if (!current) return current
      if (!isValidTargetItemCount(nextCount)) return current
      if (!current.listicleType) return current
      if (hasAnyWrittenItemData(current.items) && nextCount !== current.targetItemCount) return current

      const nextItems = resizeItemsToTargetCount(current.items, nextCount, current.listicleType)
      return {
        ...current,
        targetItemCount: nextCount,
        items: nextItems,
      }
    })
  }

  function updateHeader(next: Partial<SingleTypeListicleDraft['header']>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        header: { ...current.header, ...next },
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
      const items = current.items.filter((item) => item.id !== itemId)
      return {
        ...current,
        items,
        targetItemCount: items.length,
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
      return { ...current, items }
    })
  }

  function handleUpdateSetup() {
    if (!draft) return
    setSetupBaseline({
      location: draft.location,
      listicleType: draft.listicleType,
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

    const prevType = setupBaseline?.listicleType
    const typeChanged = prevType && prevType !== draft.listicleType
    const locationChanged = setupBaseline
      ? normalizeLocationKey(setupBaseline.location) !== normalizeLocationKey(draft.location)
      : false
    const sharedNeighborhoodsChanged = setupBaseline
      ? !areLocationIdSelectionsEqual(setupBaseline.sharedNeighborhoods, draft.sharedNeighborhoods)
      : false

    if (typeChanged) {
      if (hasResettableContent(draft)) {
        const confirmed = window.confirm(
          'Changing listicle type resets this builder and clears title, target size, header, items, and SEO. Continue?',
        )
        if (!confirmed) return
      }

      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          title: '',
          targetItemCount: 0,
          step1_complete: false,
          in_update_mode: false,
          step2_complete: false,
          step2_in_update_mode: false,
          step3_complete: false,
          step3_in_update_mode: false,
          header: {
            introMarkdown: '',
            introJsonText: '',
            featuredMediaSet: null,
            featuredImage: null,
          },
          items: [],
          seoSection: createEmptySeoSection(),
          status: 'draft',
          locationRef: selectedLocationRefId,
        }
      })
      setSetupBaseline(null)
      onError('')
      return
    }

    if (locationChanged || sharedNeighborhoodsChanged) {
      if (hasAnyWrittenItemData(draft.items)) {
        const confirmed = window.confirm(
          'Changing location or shared neighborhoods clears the current related item selections. Continue?',
        )
        if (!confirmed) return
      }

      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          in_update_mode: false,
          step1_complete: true,
          step2_complete: false,
          step2_in_update_mode: false,
          step3_complete: false,
          step3_in_update_mode: false,
          items: resizeItemsToTargetCount([], current.targetItemCount, current.listicleType),
          locationRef: selectedLocationRefId,
        }
      })
      setSetupBaseline(null)
      onError('')
      return
    }

    updateDraft({
      in_update_mode: false,
      step1_complete: true,
      locationRef: selectedLocationRefId,
      step2_complete: false,
      step2_in_update_mode: false,
      step3_complete: false,
      step3_in_update_mode: false,
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
    setTargetItemCount,
    updateHeader,
    updateItem,
    removeItem,
    moveItem,
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
