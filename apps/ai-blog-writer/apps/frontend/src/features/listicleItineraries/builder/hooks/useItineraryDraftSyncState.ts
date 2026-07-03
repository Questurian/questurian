import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBuilderAutosave } from '../../../../shared/builder/hooks/useBuilderAutosave'
import { fetchItineraryById } from '../../api'
import { saveDraft } from '../../storage'
import type { ListicleItineraryDraft } from '../../types'
import { payloadDocToDraft } from '../mappers/itinerary-draft.mapper'
import { buildItineraryDraftSyncSignature } from '../utils/itinerary-draft-sync-signature'

type UseItineraryDraftSyncStateParams = {
  token?: string | null
  draft: ListicleItineraryDraft | null
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  isLoading: boolean
  payloadIdParam: string | null
  draftIdParam: string | null
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

export function useItineraryDraftSyncState({
  token,
  draft,
  setDraft,
  isLoading,
  payloadIdParam,
  draftIdParam,
  onError,
  setResult,
}: UseItineraryDraftSyncStateParams) {
  const [hasLocalChanges, setHasLocalChanges] = useState(false)
  const [isRevertingToPayload, setIsRevertingToPayload] = useState(false)
  const syncedBaselineRef = useRef<string | null>(null)
  const bootstrappedDraftKeyRef = useRef<string | null>(null)
  const ignoreDirtyUntilRef = useRef(0)

  const isSynced = Boolean(draft?.payloadId)
  const draftSyncSignature = useMemo(
    () => (draft ? buildItineraryDraftSyncSignature(draft) : null),
    [draft],
  )
  const routeKey = `${payloadIdParam ?? ''}:${draftIdParam ?? ''}`

  const saveAutosaveDraft = useCallback((nextDraft: ListicleItineraryDraft) => {
    saveDraft({
      ...nextDraft,
      hasLocalChanges,
    })
  }, [hasLocalChanges])

  useBuilderAutosave(draft, saveAutosaveDraft)

  useEffect(() => {
    syncedBaselineRef.current = null
    bootstrappedDraftKeyRef.current = null
    ignoreDirtyUntilRef.current = 0
    setHasLocalChanges(false)
  }, [routeKey])

  useEffect(() => {
    if (isLoading || !draft || !draftSyncSignature) return

    if (!draft.payloadId) {
      syncedBaselineRef.current = draftSyncSignature
      bootstrappedDraftKeyRef.current = `local:${draft.draftId}`
      setHasLocalChanges(false)
      return
    }

    const draftKey = `${routeKey}:${draft.draftId}:${draft.payloadId}`
    if (bootstrappedDraftKeyRef.current !== draftKey) {
      bootstrappedDraftKeyRef.current = draftKey
      syncedBaselineRef.current = draft.payloadSyncBaseline || draftSyncSignature
    }

    if (Date.now() < ignoreDirtyUntilRef.current) {
      syncedBaselineRef.current = draftSyncSignature
      setHasLocalChanges(false)
      if (draft.hasLocalChanges) {
        setDraft((current) => (
          current && current.draftId === draft.draftId
            ? { ...current, hasLocalChanges: false, payloadSyncBaseline: draftSyncSignature }
            : current
        ))
      }
      return
    }

    const baseline = syncedBaselineRef.current || draftSyncSignature
    const nextHasLocalChanges = baseline !== draftSyncSignature
      || (!draft.payloadSyncBaseline && Boolean(draft.hasLocalChanges))
    setHasLocalChanges(nextHasLocalChanges)

    if (nextHasLocalChanges !== Boolean(draft.hasLocalChanges)) {
      setDraft((current) => (
        current && current.draftId === draft.draftId
          ? { ...current, hasLocalChanges: nextHasLocalChanges }
          : current
      ))
    }
  }, [draft, draftSyncSignature, isLoading, routeKey, setDraft])

  const onSyncResult = useCallback((message: string | null) => {
    setResult(message)
    if (message) {
      ignoreDirtyUntilRef.current = Date.now() + 1500
      setHasLocalChanges(false)
    }
  }, [setResult])

  const saveLocalDraft = useCallback(async (): Promise<void> => {
    if (!draft) return
    saveDraft({
      ...draft,
      hasLocalChanges: Boolean(draft.payloadId) || draft.hasLocalChanges,
    })
    if (draft.payloadId) {
      setHasLocalChanges(true)
    }
    onError('')
    setResult('Saved local draft in this browser only (not synced to Payload).')
  }, [draft, onError, setResult])

  const revertToPayloadVersion = useCallback(async (): Promise<void> => {
    if (!draft?.payloadId) return
    if (!token) {
      onError('You must be logged in to reload from Payload.')
      return
    }

    const isPublishedPayload = draft.payloadStatus === 'published' || draft.status === 'published'
    const confirmed = window.confirm(
      isPublishedPayload
        ? 'Discard local staged changes and reload the current published Payload version? Payload will not be changed.'
        : 'Discard local staged changes and reload the current Payload draft? Payload will not be changed.',
    )
    if (!confirmed) return

    onError('')
    setResult(null)
    setIsRevertingToPayload(true)

    try {
      const doc = await fetchItineraryById(draft.payloadId, token)
      const nextDraft = payloadDocToDraft(doc, draft.draftId)
      nextDraft.editorModelName = draft.editorModelName
      nextDraft.hasLocalChanges = false

      ignoreDirtyUntilRef.current = Date.now() + 1500
      setHasLocalChanges(false)
      setDraft(nextDraft)
      saveDraft(nextDraft)
      setResult(isPublishedPayload ? 'Reverted to last published Payload version.' : 'Reverted to current Payload draft.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reload from Payload.')
    } finally {
      setIsRevertingToPayload(false)
    }
  }, [draft, onError, setDraft, setResult, token])

  return {
    hasLocalChanges,
    isRevertingToPayload,
    isSynced,
    onSyncResult,
    saveLocalDraft,
    revertToPayloadVersion,
  }
}
