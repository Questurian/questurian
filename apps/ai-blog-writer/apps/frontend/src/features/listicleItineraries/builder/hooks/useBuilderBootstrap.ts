import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../../staging/api/ai/models'
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

type UseBuilderBootstrapParams = {
  token?: string | null
  payloadIdParam: string | null
  draftIdParam: string | null
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
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

export function useBuilderBootstrap({
  token,
  payloadIdParam,
  draftIdParam,
  setSearchParams,
  onError,
}: UseBuilderBootstrapParams): UseBuilderBootstrapResult {
  const [draft, setDraft] = useState<ListicleItineraryDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [mediaAssets, setMediaAssets] = useState<MediaAssetOption[]>([])
  const [instagramPosts, setInstagramPosts] = useState<InstagramPostOption[]>([])

  useEffect(() => {
    if (!token) return
    const authToken = token

    let cancelled = false

    async function load() {
      setIsLoading(true)
      onError('')

      try {
        const [locationDocs, mediaDocs, instagramDocs] = await Promise.all([
          fetchLocations(authToken),
          fetchMediaAssets(authToken),
          fetchInstagramPosts(authToken),
        ])

        if (cancelled) return
        setLocations(locationDocs)

        let nextDraft: ListicleItineraryDraft

        const payloadId = payloadIdParam ? Number(payloadIdParam) : null
        if (payloadId && Number.isFinite(payloadId)) {
          const doc = await fetchItineraryById(payloadId, authToken)
          if (cancelled) return
          const localDraft = findDraftByPayloadId(payloadId)
          nextDraft = normalizeDraftModelName(payloadDocToDraft(doc, localDraft?.draftId))
        } else if (draftIdParam) {
          const byDraftId = findDraftByDraftId(draftIdParam)
          if (byDraftId) {
            const normalizedDraftById = normalizeDraftModelName(byDraftId)
            nextDraft = normalizedDraftById
            if (normalizedDraftById !== byDraftId) {
              saveDraft(normalizedDraftById)
            }
          } else {
            nextDraft = createEmptyDraft()
            saveDraft(nextDraft)
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('draftId', nextDraft.draftId)
                return next
              },
              { replace: true },
            )
          }
        } else {
          nextDraft = createEmptyDraft()
          saveDraft(nextDraft)
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('draftId', nextDraft.draftId)
              return next
            },
            { replace: true },
          )
        }

        const missingMediaIds = collectMissingMediaAssetIds(nextDraft, mediaDocs)
        const missingInstagramIds = collectMissingInstagramPostIds(nextDraft, instagramDocs)

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

        if (cancelled) return

        setMediaAssets(appendUniqueById(mediaDocs, missingMediaDocs.filter((doc): doc is MediaAssetOption => Boolean(doc))))
        setInstagramPosts(appendUniqueById(instagramDocs, missingInstagramDocs.filter((doc): doc is InstagramPostOption => Boolean(doc))))
        setDraft(nextDraft)
      } catch (err) {
        if (cancelled) return
        onError(err instanceof Error ? err.message : 'Failed to initialize builder')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [token, payloadIdParam, draftIdParam, setSearchParams, onError])

  return {
    draft,
    setDraft,
    isLoading,
    locations,
    mediaAssets,
    instagramPosts,
  }
}
