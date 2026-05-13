import type { Dispatch, SetStateAction } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../../../shared/api/ai/models'
import { useBuilderBootstrap as useSharedBuilderBootstrap } from '../../../../shared/builder/hooks/useBuilderBootstrap'
import { fetchInstagramPosts, fetchItineraryById, fetchLocations, fetchMediaAssets } from '../../api'
import { createEmptyDraft, findDraftByDraftId, findDraftByPayloadId, saveDraft } from '../../storage'
import { normalizeSeoSection } from '../services/seo-section.service'
import {
  getItineraryBlocksInArticleOrder,
  isManualItineraryBlockType,
  type InstagramPostOption,
  type ListicleItineraryDraft,
  type LocationOption,
  type MediaAssetOption,
} from '../../types'
import { payloadDocToDraft } from '../mappers/itinerary-draft.mapper'
import { buildItineraryDraftSyncSignature } from '../utils/itinerary-draft-sync-signature'

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
  instagramPosts: InstagramPostOption[]
}

type UseBuilderBootstrapResult = {
  draft: ListicleItineraryDraft | null
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  isLoading: boolean
  locations: LocationOption[]
  mediaAssets: MediaAssetOption[]
  instagramPosts: InstagramPostOption[]
}

function appendUniqueById<T extends { id: number }>(base: T[], extra: T[]): T[] {
  const seen = new Set(base.map((item) => item.id))
  const next = [...base]

  extra.forEach((item) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    next.push(item)
  })

  return next
}

function collectMissingMediaAssetIds(
  draft: ListicleItineraryDraft,
  mediaAssets: MediaAssetOption[],
): number[] {
  const knownIds = new Set(mediaAssets.map((asset) => asset.id))
  const requestedIds = new Set<number>()

  if (draft.header.featuredImage && !knownIds.has(draft.header.featuredImage)) {
    requestedIds.add(draft.header.featuredImage)
  }

  getItineraryBlocksInArticleOrder(draft).forEach((item) => {
    if (!isManualItineraryBlockType(item.blockType) || !item.image || knownIds.has(item.image)) {
      return
    }
    requestedIds.add(item.image)
  })

  return [...requestedIds]
}

function collectMissingInstagramPostIds(
  draft: ListicleItineraryDraft,
  instagramPosts: InstagramPostOption[],
): number[] {
  const knownIds = new Set(instagramPosts.map((post) => post.id))
  const requestedIds = new Set<number>()

  getItineraryBlocksInArticleOrder(draft).forEach((item) => {
    if (!isManualItineraryBlockType(item.blockType) || !item.instagramPost || knownIds.has(item.instagramPost)) {
      return
    }
    requestedIds.add(item.instagramPost)
  })

  return [...requestedIds]
}

function normalizeDraftModelName(draft: ListicleItineraryDraft): ListicleItineraryDraft {
  const normalizedModelName = resolveEditorAssistModelName(draft.editorModelName)
  const normalizedSeo = normalizeSeoSection(draft.seoSection)
  if (
    normalizedModelName === draft.editorModelName
    && JSON.stringify(normalizedSeo) === JSON.stringify(draft.seoSection)
  ) return draft
  return {
    ...draft,
    editorModelName: normalizedModelName,
    seoSection: normalizedSeo,
  }
}

export function mergeLocalIntoPayloadDraft(
  payloadDraft: ListicleItineraryDraft,
  localDraft: ListicleItineraryDraft,
): ListicleItineraryDraft {
  const payloadSyncBaseline = buildItineraryDraftSyncSignature(payloadDraft)

  if (!localDraft.hasLocalChanges) {
    return {
      ...payloadDraft,
      editorModelName: localDraft.editorModelName,
      payloadSyncBaseline,
    }
  }

  const merged = {
    ...localDraft,
    payloadId: payloadDraft.payloadId,
    payloadStatus: payloadDraft.payloadStatus,
    payloadPublishedAt: payloadDraft.payloadPublishedAt,
    payloadUpdatedAt: payloadDraft.payloadUpdatedAt,
    payloadAuthorName: payloadDraft.payloadAuthorName,
    status: payloadDraft.status,
    articleType: payloadDraft.articleType,
    payloadSyncBaseline,
  }

  if (buildItineraryDraftSyncSignature(merged) === payloadSyncBaseline) {
    return {
      ...payloadDraft,
      draftId: localDraft.draftId,
      editorModelName: localDraft.editorModelName,
      hasLocalChanges: false,
      payloadSyncBaseline,
    }
  }

  return {
    ...merged,
    hasLocalChanges: true,
  }
}

export function useBuilderBootstrap({
  token,
  payloadIdParam,
  draftIdParam,
  setSearchParams,
  onError,
}: UseBuilderBootstrapParams): UseBuilderBootstrapResult {
  const { draft, setDraft, isLoading, auxData } = useSharedBuilderBootstrap<
    ListicleItineraryDraft,
    Awaited<ReturnType<typeof fetchItineraryById>>,
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
      createEmptyDraft,
      saveDraft,
    },
    loadAuxData: async (authToken) => {
      const [locationDocs, mediaDocs, instagramDocs] = await Promise.all([
        fetchLocations(authToken),
        fetchMediaAssets(authToken),
        fetchInstagramPosts(authToken),
      ])
      return { locations: locationDocs, mediaAssets: mediaDocs, instagramPosts: instagramDocs }
    },
    fetchPayloadDoc: fetchItineraryById,
    payloadDocToDraft,
    mergeLocalIntoPayloadDraft,
    normalizeDraft: normalizeDraftModelName,
    enrichAuxData: async (nextDraft, authToken, aux) => {
      const missingMediaIds = collectMissingMediaAssetIds(nextDraft, aux.mediaAssets)
      const missingInstagramIds = collectMissingInstagramPostIds(nextDraft, aux.instagramPosts)

      const [missingMediaDocs, missingInstagramDocs] = await Promise.all([
        Promise.all(missingMediaIds.map(async (id) => {
          const docs = await fetchMediaAssets(authToken, { id })
          return docs[0] || null
        })),
        Promise.all(missingInstagramIds.map(async (id) => {
          const docs = await fetchInstagramPosts(authToken, { id })
          return docs[0] || null
        })),
      ])

      return {
        locations: aux.locations,
        mediaAssets: appendUniqueById(aux.mediaAssets, missingMediaDocs.filter((doc): doc is MediaAssetOption => Boolean(doc))),
        instagramPosts: appendUniqueById(aux.instagramPosts, missingInstagramDocs.filter((doc): doc is InstagramPostOption => Boolean(doc))),
      }
    },
    initialAuxData: { locations: [], mediaAssets: [], instagramPosts: [] },
  })

  return {
    draft,
    setDraft,
    isLoading,
    locations: auxData.locations,
    mediaAssets: auxData.mediaAssets,
    instagramPosts: auxData.instagramPosts,
  }
}
