import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../../staging/api/ai/models'
import { fetchListicleById, fetchLocations, fetchMediaAssets } from '../../api'
import { createEmptySeoSection, normalizeSeoSection } from '../services/seo-section.service'
import { createEmptyDraft, findDraftByDraftId, findDraftByPayloadId, saveDraft } from '../../storage'
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

export function useBuilderBootstrap({
  token,
  payloadIdParam,
  draftIdParam,
  setSearchParams,
  onError,
}: UseBuilderBootstrapParams): UseBuilderBootstrapResult {
  const [draft, setDraft] = useState<SingleTypeListicleDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [mediaAssets, setMediaAssets] = useState<MediaAssetOption[]>([])

  useEffect(() => {
    if (!token) return
    const authToken = token

    let cancelled = false

    async function load() {
      setIsLoading(true)
      onError('')

      try {
        const [locationDocs, mediaDocs] = await Promise.all([
          fetchLocations(authToken),
          fetchMediaAssets(authToken),
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
            const doc = await fetchListicleById(payloadId, authToken)
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
        fresh.seoSection = createEmptySeoSection()
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
