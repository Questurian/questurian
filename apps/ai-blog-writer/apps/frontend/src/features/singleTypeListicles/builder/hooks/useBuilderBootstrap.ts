import type { Dispatch, SetStateAction } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../../../shared/api/ai/models'
import { useBuilderBootstrap as useSharedBuilderBootstrap } from '../../../../shared/builder/hooks/useBuilderBootstrap'
import { fetchListicleById, fetchLocations, fetchMediaAssets } from '../../api'
import { createEmptyDraft, findDraftByDraftId, findDraftByPayloadId, saveDraft } from '../../storage'
import { createEmptySeoSection, normalizeSeoSection } from '../services/seo-section.service'
import type { LocationOption, MediaAssetOption, SingleTypeListicleDraft } from '../../types'
import { payloadDocToDraft } from '../mappers/listicle-draft.mapper'
import { normalizeTargetItemCount } from '../utils/item-target-count.utils'
import {
  buildSingleTypeListicleDraftComparableShape,
  buildSingleTypeListicleDraftSyncSignature,
} from '../utils/single-type-listicle-draft-sync-signature'
import {
  markDraftAsPayloadSynced,
  refreshDraftPayloadSyncState,
} from '../../../../shared/payloadSync/draftPayloadSync'

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
  const payloadSyncedDraft = markDraftAsPayloadSynced(
    payloadDraft,
    buildSingleTypeListicleDraftComparableShape,
    payloadDraft.payloadUpdatedAt || payloadDraft.updatedAt || new Date().toISOString(),
  )
  const lastPayloadSyncSignature = payloadSyncedDraft.lastPayloadSyncSignature
    ?? buildSingleTypeListicleDraftSyncSignature(payloadSyncedDraft)
  const localHasUnsyncedPayloadChanges = Boolean(localDraft.hasUnsyncedPayloadChanges)
    || buildSingleTypeListicleDraftSyncSignature(localDraft) !== lastPayloadSyncSignature

  if (!localHasUnsyncedPayloadChanges) {
    return {
      ...payloadSyncedDraft,
      editorModelName: localDraft.editorModelName,
    }
  }

  const merged = {
    ...localDraft,
    payloadId: payloadSyncedDraft.payloadId,
    payloadStatus: payloadSyncedDraft.payloadStatus,
    payloadPublishedAt: payloadSyncedDraft.payloadPublishedAt,
    payloadUpdatedAt: payloadSyncedDraft.payloadUpdatedAt,
    payloadAuthorName: payloadSyncedDraft.payloadAuthorName,
    status: payloadSyncedDraft.status,
    articleType: payloadSyncedDraft.articleType,
    lastPayloadSyncSignature,
    lastPayloadSyncAt: payloadSyncedDraft.lastPayloadSyncAt,
  }
  const refreshed = refreshDraftPayloadSyncState(merged, buildSingleTypeListicleDraftComparableShape)

  if (!refreshed.hasUnsyncedPayloadChanges) {
    return {
      ...payloadSyncedDraft,
      draftId: localDraft.draftId,
      editorModelName: localDraft.editorModelName,
    }
  }

  return refreshed
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
