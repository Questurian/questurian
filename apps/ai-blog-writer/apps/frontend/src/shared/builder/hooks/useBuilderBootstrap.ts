import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

export type BuilderBootstrapStorage<TDraft extends { draftId: string }> = {
  findDraftByPayloadId: (id: number) => TDraft | null | undefined
  findDraftByDraftId: (id: string) => TDraft | null | undefined
  createEmptyDraft: () => TDraft
  saveDraft: (draft: TDraft) => void
}

export type BuilderBootstrapParams<TDraft extends { draftId: string }, TPayloadDoc, TAuxData> = {
  payloadIdParam: string | null
  draftIdParam: string | null
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
  storage: BuilderBootstrapStorage<TDraft>
  loadAuxData: () => Promise<TAuxData>
  fetchPayloadDoc: (id: number) => Promise<TPayloadDoc>
  payloadDocToDraft: (doc: TPayloadDoc, existingDraftId?: string) => TDraft
  /** Optional. Apply local-draft preserved fields (e.g. markdown) onto a payload-loaded draft. */
  mergeLocalIntoPayloadDraft?: (payloadDraft: TDraft, localDraft: TDraft) => TDraft
  /** Optional. Normalize/repair a draft right before it is set. */
  normalizeDraft?: (draft: TDraft) => TDraft
  /** Optional. Refine aux data after the draft is known (e.g. backfill missing related IDs). */
  enrichAuxData?: (draft: TDraft, aux: TAuxData) => Promise<TAuxData>
  initialAuxData: TAuxData
}

export type BuilderBootstrapResult<TDraft, TAuxData> = {
  draft: TDraft | null
  setDraft: Dispatch<SetStateAction<TDraft | null>>
  isLoading: boolean
  auxData: TAuxData
}

export function useBuilderBootstrap<
  TDraft extends { draftId: string },
  TPayloadDoc,
  TAuxData,
>({
  payloadIdParam,
  draftIdParam,
  setSearchParams,
  onError,
  storage,
  loadAuxData,
  fetchPayloadDoc,
  payloadDocToDraft,
  mergeLocalIntoPayloadDraft,
  normalizeDraft,
  enrichAuxData,
  initialAuxData,
}: BuilderBootstrapParams<TDraft, TPayloadDoc, TAuxData>): BuilderBootstrapResult<TDraft, TAuxData> {
  const [draft, setDraft] = useState<TDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [auxData, setAuxData] = useState<TAuxData>(initialAuxData)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      onError('')

      try {
        const baseAux = await loadAuxData()
        if (cancelled) return

        let nextDraft: TDraft

        const payloadId = payloadIdParam ? Number(payloadIdParam) : null
        if (payloadId && Number.isFinite(payloadId)) {
          const doc = await fetchPayloadDoc(payloadId)
          if (cancelled) return
          const localDraft = storage.findDraftByPayloadId(payloadId)
          let payloadDraft = payloadDocToDraft(doc, localDraft?.draftId)
          if (localDraft && mergeLocalIntoPayloadDraft) {
            payloadDraft = mergeLocalIntoPayloadDraft(payloadDraft, localDraft)
          }
          nextDraft = normalizeDraft ? normalizeDraft(payloadDraft) : payloadDraft
        } else if (draftIdParam) {
          const byDraftId = storage.findDraftByDraftId(draftIdParam)
          if (byDraftId) {
            const normalized = normalizeDraft ? normalizeDraft(byDraftId) : byDraftId
            nextDraft = normalized
            if (normalized !== byDraftId) {
              storage.saveDraft(normalized)
            }
          } else {
            const fresh = storage.createEmptyDraft()
            const normalizedFresh = normalizeDraft ? normalizeDraft(fresh) : fresh
            storage.saveDraft(normalizedFresh)
            nextDraft = normalizedFresh
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('draftId', normalizedFresh.draftId)
                return next
              },
              { replace: true },
            )
          }
        } else {
          const fresh = storage.createEmptyDraft()
          const normalizedFresh = normalizeDraft ? normalizeDraft(fresh) : fresh
          storage.saveDraft(normalizedFresh)
          nextDraft = normalizedFresh
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('draftId', normalizedFresh.draftId)
              return next
            },
            { replace: true },
          )
        }

        const finalAux = enrichAuxData
          ? await enrichAuxData(nextDraft, baseAux)
          : baseAux

        if (cancelled) return

        setAuxData(finalAux)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadIdParam, draftIdParam])

  return { draft, setDraft, isLoading, auxData }
}
