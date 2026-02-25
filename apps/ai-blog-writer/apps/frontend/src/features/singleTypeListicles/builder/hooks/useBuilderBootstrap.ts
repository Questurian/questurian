import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../../staging/api/ai/models'
import { fetchListicleById, fetchLocations, fetchMediaAssets, fetchSeoMetadata } from '../../api'
import { createEmptyDraft, findDraftByDraftId, findDraftByPayloadId, saveDraft } from '../../storage'
import type { MediaAssetOption, SeoMetadataOption, SingleTypeListicleDraft } from '../../types'
import { payloadDocToDraft } from '../mappers/listicle-draft.mapper'

type UseBuilderBootstrapParams = {
  token?: string
  payloadIdParam: string | null
  draftIdParam: string | null
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
}

type UseBuilderBootstrapResult = {
  draft: SingleTypeListicleDraft | null
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  isLoading: boolean
  locations: Array<{ id: number; locationKey: string }>
  mediaAssets: MediaAssetOption[]
  seoOptions: SeoMetadataOption[]
  setSeoOptions: Dispatch<SetStateAction<SeoMetadataOption[]>>
}

function normalizeDraftModelName(draft: SingleTypeListicleDraft): SingleTypeListicleDraft {
  const normalizedModelName = resolveEditorAssistModelName(draft.editorModelName)
  if (normalizedModelName === draft.editorModelName) return draft
  return {
    ...draft,
    editorModelName: normalizedModelName,
  }
}

export function useBuilderBootstrap({
  token,
  payloadIdParam,
  draftIdParam,
  setSearchParams,
  onError,
}: UseBuilderBootstrapParams): UseBuilderBootstrapResult {
  const [draft, setDraft] = useState<SingleTypeListicleDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [locations, setLocations] = useState<Array<{ id: number; locationKey: string }>>([])
  const [mediaAssets, setMediaAssets] = useState<MediaAssetOption[]>([])
  const [seoOptions, setSeoOptions] = useState<SeoMetadataOption[]>([])

  useEffect(() => {
    if (!token) return

    let cancelled = false

    async function load() {
      setIsLoading(true)
      onError('')

      try {
        const [locationDocs, mediaDocs, seoDocs] = await Promise.all([
          fetchLocations(token),
          fetchMediaAssets(token),
          fetchSeoMetadata(token),
        ])

        if (cancelled) return
        setLocations(locationDocs)
        setMediaAssets(mediaDocs)
        setSeoOptions(seoDocs)

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
            const doc = await fetchListicleById(payloadId, token)
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
    seoOptions,
    setSeoOptions,
  }
}
