import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../../staging/api/ai/models'
import { fetchItineraryById, fetchLocations, fetchMediaAssets } from '../../api'
import { createEmptyDraft, findDraftByDraftId, findDraftByPayloadId, saveDraft } from '../../storage'
import { normalizeSeoSection } from '../services/seo-section.service'
import type { ListicleItineraryDraft, LocationOption, MediaAssetOption } from '../../types'
import { payloadDocToDraft } from '../mappers/itinerary-draft.mapper'

type UseBuilderBootstrapParams = {
  token?: string
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

  useEffect(() => {
    if (!token) return

    let cancelled = false

    async function load() {
      setIsLoading(true)
      onError('')

      try {
        const [locationDocs, mediaDocs] = await Promise.all([
          fetchLocations(token),
          fetchMediaAssets(token),
        ])

        if (cancelled) return
        setLocations(locationDocs)
        setMediaAssets(mediaDocs)

        const payloadId = payloadIdParam ? Number(payloadIdParam) : null
        if (payloadId && Number.isFinite(payloadId)) {
          const localDraft = findDraftByPayloadId(payloadId)
          if (localDraft) {
            const normalizedLocalDraft = normalizeDraftModelName(localDraft)
            setDraft(normalizedLocalDraft)
            if (normalizedLocalDraft !== localDraft) {
              saveDraft(normalizedLocalDraft)
            }
          } else {
            const doc = await fetchItineraryById(payloadId, token)
            if (cancelled) return
            const normalizedPayloadDraft = normalizeDraftModelName(payloadDocToDraft(doc))
            setDraft(normalizedPayloadDraft)
          }
          return
        }

        if (draftIdParam) {
          const byDraftId = findDraftByDraftId(draftIdParam)
          if (byDraftId) {
            const normalizedDraftById = normalizeDraftModelName(byDraftId)
            setDraft(normalizedDraftById)
            if (normalizedDraftById !== byDraftId) {
              saveDraft(normalizedDraftById)
            }
            return
          }
        }

        const fresh = createEmptyDraft()
        saveDraft(fresh)
        setDraft(fresh)
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.set('draftId', fresh.draftId)
            return next
          },
          { replace: true },
        )
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
  }
}
