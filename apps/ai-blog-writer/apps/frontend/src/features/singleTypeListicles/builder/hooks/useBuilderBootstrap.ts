import type { Dispatch, SetStateAction } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../../staging/api/ai/models'
import { useBuilderBootstrap as useSharedBuilderBootstrap } from '../../../shared/builder/hooks/useBuilderBootstrap'
import { fetchListicleById, fetchLocations, fetchMediaAssets } from '../../api'
import { createEmptyDraft, findDraftByDraftId, findDraftByPayloadId, saveDraft } from '../../storage'
import { createEmptySeoSection, normalizeSeoSection } from '../services/seo-section.service'
import type { LocationOption, MediaAssetOption, SingleTypeListicleDraft } from '../../types'
import { payloadDocToDraft } from '../mappers/listicle-draft.mapper'
import { normalizeTargetItemCount } from '../utils/item-target-count.utils'

type UseBuilderBootstrapParams = {
  token?: string | null
  payloadIdParam: string | null
  draftIdParam: string | null
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
}

type AuxData = {
  locations: LocationOption[]
  mediaAssets: MediaAssetOption[]
}

type UseBuilderBootstrapResult = {
  draft: SingleTypeListicleDraft | null
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  isLoading: boolean
  locations: LocationOption[]
  mediaAssets: MediaAssetOption[]
}

function normalizeDraftModelName(draft: SingleTypeListicleDraft): SingleTypeListicleDraft {
  const normalizedTargetItemCount = normalizeTargetItemCount(draft.targetItemCount, draft.items)
  const normalizedModelName = resolveEditorAssistModelName(draft.editorModelName)
  const normalizedSeoSection = normalizeSeoSection(draft.seoSection)
  if (
    normalizedModelName === draft.editorModelName
    && normalizedTargetItemCount === draft.targetItemCount
    && JSON.stringify(normalizedSeoSection) === JSON.stringify(draft.seoSection)
  ) return draft
  return {
    ...draft,
    editorModelName: normalizedModelName,
    targetItemCount: normalizedTargetItemCount,
    seoSection: normalizedSeoSection,
  }
}

function mergeLocalIntoPayloadDraft(
  payloadDraft: SingleTypeListicleDraft,
  localDraft: SingleTypeListicleDraft,
): SingleTypeListicleDraft {
  const next = { ...payloadDraft }
  // Payload stores blurbs/intro as Lexical JSON; restore the editable markdown
  // from the local draft so editors are not blank on reload.
  if (localDraft.header.introMarkdown) {
    next.header = { ...payloadDraft.header, introMarkdown: localDraft.header.introMarkdown }
  }
  next.items = payloadDraft.items.map((item) => {
    const localItem = localDraft.items.find((li) => li.item === item.item)
    return localItem?.blurbMarkdown
      ? { ...item, blurbMarkdown: localItem.blurbMarkdown }
      : item
  })
  return next
}

export function useBuilderBootstrap({
  token,
  payloadIdParam,
  draftIdParam,
  setSearchParams,
  onError,
}: UseBuilderBootstrapParams): UseBuilderBootstrapResult {
  const { draft, setDraft, isLoading, auxData } = useSharedBuilderBootstrap<
    SingleTypeListicleDraft,
    Awaited<ReturnType<typeof fetchListicleById>>,
    AuxData
  >({
    token,
    payloadIdParam,
    draftIdParam,
    setSearchParams,
    onError,
    storage: {
      findDraftByPayloadId,
      findDraftByDraftId,
      createEmptyDraft: () => {
        const fresh = createEmptyDraft()
        fresh.seoSection = createEmptySeoSection()
        return fresh
      },
      saveDraft,
    },
    loadAuxData: async (authToken) => {
      const [locationDocs, mediaDocs] = await Promise.all([
        fetchLocations(authToken),
        fetchMediaAssets(authToken),
      ])
      return { locations: locationDocs, mediaAssets: mediaDocs }
    },
    fetchPayloadDoc: fetchListicleById,
    payloadDocToDraft,
    mergeLocalIntoPayloadDraft,
    normalizeDraft: normalizeDraftModelName,
    initialAuxData: { locations: [], mediaAssets: [] },
  })

  return {
    draft,
    setDraft,
    isLoading,
    locations: auxData.locations,
    mediaAssets: auxData.mediaAssets,
  }
}
